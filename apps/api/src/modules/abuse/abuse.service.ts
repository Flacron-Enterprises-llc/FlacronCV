import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FirebaseAdminService } from '../firebase/firebase-admin.service';
import { hmacHex, isHmacSecretConfigured } from '../../common/utils/hmac';
import {
  ABUSE_DEVICES_COLLECTION,
  ABUSE_NETWORKS_COLLECTION,
  APP_SETTINGS_COLLECTION,
  APP_SETTINGS_DOC,
  DEFAULT_ABUSE_SETTINGS,
  DEVICE_TOKEN_RE,
  DEVICE_UID_CAP,
  NETWORK_RECENT_CAP,
} from './abuse.constants';
import { computeRiskScore, mergeAbuseSettings, RiskFlags } from './abuse-score';
import { isDisposableEmail } from './disposable-email';
import { looksLikeScriptedUserAgent, networkIdentifier, normalizeClientIp } from './ip';
import { RiskBand, RiskSignalCode, UserAbuse } from '@flacroncv/shared-types';

export interface RegistrationSignalsInput {
  uid: string;
  email: string;
  ipAddress?: string;
  userAgent?: string;
  deviceToken?: string;
}

interface DeviceLookup {
  uids: string[];
  uidCount: number;
  receivedFree: boolean;
  lastSeenAt: string;
  createdAt: string;
}

interface NetworkLookup {
  recentAt: string[];
}

@Injectable()
export class AbuseService {
  private readonly logger = new Logger(AbuseService.name);

  constructor(
    private firebaseAdmin: FirebaseAdminService,
    private configService: ConfigService,
  ) {}

  /**
   * Collect, hash, score, persist. Never throws to the caller — signup must
   * succeed even when the HMAC secret is missing or Firestore is unhappy.
   * Never logs a raw IP, raw token, or email.
   */
  async recordRegistrationSignals(input: RegistrationSignalsInput): Promise<void> {
    try {
      await this.recordRegistrationSignalsUnsafe(input);
    } catch {
      this.logger.warn(`Abuse scoring skipped uid=${input.uid}`);
    }
  }

  private async recordRegistrationSignalsUnsafe(input: RegistrationSignalsInput): Promise<void> {
    const secret = this.configService.get<string>('abuseHmacSecret');
    if (!isHmacSecretConfigured(secret)) {
      this.logger.warn('Abuse HMAC secret is not configured; scoring skipped');
      return;
    }

    const settings = await this.loadSettings();
    const deviceToken =
      input.deviceToken && DEVICE_TOKEN_RE.test(input.deviceToken)
        ? input.deviceToken.toLowerCase()
        : null;
    const ip = normalizeClientIp(input.ipAddress);

    const deviceHash = deviceToken ? hmacHex(secret, `device:${deviceToken}`) : null;
    const ipHash = ip ? hmacHex(secret, `ip:${ip}`) : null;
    const networkHash =
      ip && ipHash ? hmacHex(secret, `net:${networkIdentifier(ip)}`) : null;

    const now = new Date();
    const nowIso = now.toISOString();

    const device = deviceHash ? await this.readDevice(deviceHash) : null;
    const network = networkHash ? await this.readNetwork(networkHash) : null;

    const priorUids = (device?.uids ?? []).filter((id) => id && id !== input.uid);
    const windowMs = settings.networkBurstWindowHours * 60 * 60 * 1000;
    const recent = (network?.recentAt ?? []).filter(
      (iso) => now.getTime() - Date.parse(iso) <= windowMs,
    );
    // Count includes this registration so the third housemate trips the
    // burst — and the IP-alone clamp keeps their band at allow.
    const networkCountIncludingCurrent = recent.length + 1;

    const deletedPrior = await this.anyDeleted(priorUids);

    const flags: RiskFlags = {
      identityReceivedFree: Boolean(device?.receivedFree),
      deviceReceivedFree: Boolean(device?.receivedFree),
      multipleAccountsDevice: priorUids.length >= 1,
      networkBurst: networkCountIncludingCurrent >= settings.networkBurstCount,
      disposableEmail: isDisposableEmail(input.email),
      botActivity: looksLikeScriptedUserAgent(input.userAgent),
      vpnDatacenter: false,
      repeatCreateDelete: deletedPrior,
    };

    const result = computeRiskScore(flags, settings);

    const abuse: UserAbuse = {
      deviceHash,
      ipHash,
      networkHash: networkHash && networkHash !== ipHash ? networkHash : ipHash,
      riskScore: result.score,
      riskBand: result.band,
      riskSignals: result.signals,
      scoredAt: now,
    };

    await this.firebaseAdmin.firestore.collection('users').doc(input.uid).update({
      abuse,
      updatedAt: now,
    });

    if (deviceHash) {
      await this.writeDevice(deviceHash, input.uid, device, nowIso);
    }
    if (networkHash) {
      await this.writeNetwork(networkHash, network, nowIso, windowMs);
    }

    this.logScore(input.uid, result.score, result.band, result.signals);
  }

  private logScore(
    uid: string,
    score: number,
    band: RiskBand,
    signals: RiskSignalCode[],
  ): void {
    this.logger.log(
      `Registration risk recorded uid=${uid} score=${score} band=${band} signals=${signals.join(',') || 'none'}`,
    );
  }

  private async loadSettings() {
    try {
      const snap = await this.firebaseAdmin.firestore
        .collection(APP_SETTINGS_COLLECTION)
        .doc(APP_SETTINGS_DOC)
        .get();
      const raw = snap.exists ? (snap.data() as { abuse?: unknown })?.abuse : undefined;
      return mergeAbuseSettings(raw ?? DEFAULT_ABUSE_SETTINGS);
    } catch {
      return DEFAULT_ABUSE_SETTINGS;
    }
  }

  private async readDevice(hash: string): Promise<DeviceLookup | null> {
    const snap = await this.firebaseAdmin.firestore
      .collection(ABUSE_DEVICES_COLLECTION)
      .doc(hash)
      .get();
    if (!snap.exists) return null;
    const data = snap.data() as Partial<DeviceLookup>;
    const uids = Array.isArray(data.uids)
      ? data.uids.filter((id): id is string => typeof id === 'string')
      : [];
    return {
      uids,
      uidCount: typeof data.uidCount === 'number' ? data.uidCount : uids.length,
      receivedFree: Boolean(data.receivedFree),
      lastSeenAt: typeof data.lastSeenAt === 'string' ? data.lastSeenAt : '',
      createdAt: typeof data.createdAt === 'string' ? data.createdAt : '',
    };
  }

  private async readNetwork(hash: string): Promise<NetworkLookup | null> {
    const snap = await this.firebaseAdmin.firestore
      .collection(ABUSE_NETWORKS_COLLECTION)
      .doc(hash)
      .get();
    if (!snap.exists) return null;
    const data = snap.data() as Partial<NetworkLookup>;
    return {
      recentAt: Array.isArray(data.recentAt)
        ? data.recentAt.filter((iso): iso is string => typeof iso === 'string')
        : [],
    };
  }

  private async writeDevice(
    hash: string,
    uid: string,
    previous: DeviceLookup | null,
    nowIso: string,
  ): Promise<void> {
    const uids = previous?.uids ? [...previous.uids] : [];
    if (!uids.includes(uid)) uids.push(uid);
    while (uids.length > DEVICE_UID_CAP) uids.shift();
    await this.firebaseAdmin.firestore.collection(ABUSE_DEVICES_COLLECTION).doc(hash).set({
      uids,
      uidCount: uids.length,
      receivedFree: true,
      lastSeenAt: nowIso,
      createdAt: previous?.createdAt || nowIso,
    });
  }

  private async writeNetwork(
    hash: string,
    previous: NetworkLookup | null,
    nowIso: string,
    windowMs: number,
  ): Promise<void> {
    const cutoff = Date.parse(nowIso) - windowMs;
    const recentAt = (previous?.recentAt ?? []).filter((iso) => Date.parse(iso) >= cutoff);
    recentAt.push(nowIso);
    while (recentAt.length > NETWORK_RECENT_CAP) recentAt.shift();
    await this.firebaseAdmin.firestore.collection(ABUSE_NETWORKS_COLLECTION).doc(hash).set({
      recentAt,
    });
  }

  private async anyDeleted(uids: string[]): Promise<boolean> {
    const sample = uids.slice(-5);
    for (const uid of sample) {
      try {
        const snap = await this.firebaseAdmin.firestore.collection('users').doc(uid).get();
        if (!snap.exists) return true;
        const deletedAt = (snap.data() as { deletedAt?: unknown } | undefined)?.deletedAt;
        if (deletedAt) return true;
      } catch {
        // A failed read must not fail signup or invent a signal.
      }
    }
    return false;
  }
}
