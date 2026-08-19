import { NotFoundException, HttpException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FirebaseAdminService } from '../firebase/firebase-admin.service';
import { hmacHex, isHmacSecretConfigured } from '../../common/utils/hmac';
import {
  ABUSE_DEVICES_COLLECTION,
  ABUSE_IDEMPOTENCY_COLLECTION,
  ABUSE_NETWORKS_COLLECTION,
  ABUSE_RATE_COLLECTION,
  APP_SETTINGS_COLLECTION,
  APP_SETTINGS_DOC,
  DEFAULT_ABUSE_SETTINGS,
  DEVICE_TOKEN_RE,
  DEVICE_UID_CAP,
  IDEMPOTENCY_TTL_MS,
  NETWORK_CREATE_PER_HOUR,
  NETWORK_RECENT_CAP,
  UID_RATE_LIMITS,
  UID_RATE_WINDOW_MS,
} from './abuse.constants';
import { computeRiskScore, mergeAbuseSettings, RiskFlags } from './abuse-score';
import { cooldownEnd, decideNewConsumption, grantStatusForBand, ConsumptionKind } from './abuse-grant';
import { ABUSE_CODE, throwAbuse } from './abuse.exceptions';
import { isDisposableEmail } from './disposable-email';
import { looksLikeScriptedUserAgent, networkIdentifier, normalizeClientIp } from './ip';
import { RiskBand, RiskSignalCode, User, UserAbuse, resolveEffectivePlan } from '@flacroncv/shared-types';

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
  private enforcementCache: { value: boolean; at: number } | null = null;
  private static readonly ENFORCEMENT_TTL_MS = 15_000;

  constructor(
    private firebaseAdmin: FirebaseAdminService,
    private configService: ConfigService,
  ) {}

  /**
   * Kill switch. Default and missing → false (observe-only). A Firestore
   * read error fails OPEN so a settings outage cannot start rejecting people.
   * Cached 15s so an operator flip is felt quickly without a deploy.
   */
  async isEnforcementOn(): Promise<boolean> {
    const now = Date.now();
    if (
      this.enforcementCache &&
      now - this.enforcementCache.at < AbuseService.ENFORCEMENT_TTL_MS
    ) {
      return this.enforcementCache.value;
    }
    try {
      const settings = await this.loadSettings();
      const value = settings.enforcementEnabled === true;
      this.enforcementCache = { value, at: now };
      return value;
    } catch {
      this.logger.warn('Abuse enforcement flag unreadable; failing open (observe-only)');
      return this.enforcementCache?.value ?? false;
    }
  }

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
    const enforcementOn = settings.enforcementEnabled === true;

    const abuse: UserAbuse = {
      deviceHash,
      ipHash,
      networkHash: networkHash && networkHash !== ipHash ? networkHash : ipHash,
      riskScore: result.score,
      riskBand: result.band,
      riskSignals: result.signals,
      scoredAt: now,
    };

    let grantReceived = !enforcementOn;
    if (enforcementOn) {
      const grantStatus = grantStatusForBand(result.band);
      abuse.grantStatus = grantStatus;
      if (grantStatus === 'pending_step_up') {
        abuse.cooldownEndsAt = cooldownEnd(now, settings.stepUpCooldownHours);
      }
      grantReceived = grantStatus === 'eligible';
    }

    await this.firebaseAdmin.firestore.collection('users').doc(input.uid).update({
      abuse,
      updatedAt: now,
    });

    if (deviceHash) {
      await this.writeDevice(deviceHash, input.uid, device, nowIso, grantReceived);
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
    grantReceived: boolean,
  ): Promise<void> {
    const uids = previous?.uids ? [...previous.uids] : [];
    if (!uids.includes(uid)) uids.push(uid);
    while (uids.length > DEVICE_UID_CAP) uids.shift();
    await this.firebaseAdmin.firestore.collection(ABUSE_DEVICES_COLLECTION).doc(hash).set({
      uids,
      uidCount: uids.length,
      // Never clear a prior true — another account on this device already got Free.
      receivedFree: Boolean(previous?.receivedFree) || grantReceived,
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

  /**
   * Flood cap on NEW Firestore user creates per hashed network. Existing
   * `/auth/verify` calls are not throttled here. Missing HMAC / IP / a read
   * error fails open. Off when the kill switch is off.
   */
  async assertNetworkCreateAllowed(ipAddress?: string): Promise<void> {
    try {
      if (!(await this.isEnforcementOn())) return;
      const secret = this.configService.get<string>('abuseHmacSecret');
      if (!isHmacSecretConfigured(secret)) return;
      const ip = normalizeClientIp(ipAddress);
      if (!ip) return;
      const networkHash = hmacHex(secret, `net:${networkIdentifier(ip)}`);
      if (!networkHash) return;
      const network = await this.readNetwork(networkHash);
      const hourAgo = Date.now() - 60 * 60 * 1000;
      const recentHour = (network?.recentAt ?? []).filter((iso) => Date.parse(iso) >= hourAgo);
      if (recentHour.length >= NETWORK_CREATE_PER_HOUR) {
        this.logger.warn('Network create cap reached');
        throwAbuse(ABUSE_CODE.NETWORK_CREATE_CAP);
      }
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.logger.warn('Network create cap skipped (fail open)');
    }
  }

  /**
   * Free-grant + email gate for new consumption. Paid plans skip. Kill switch
   * off skips. Settings/Auth/user-read failures fail open.
   */
  async assertNewConsumption(uid: string, kind: ConsumptionKind): Promise<void> {
    try {
      await this.assertUidRate(uid, kind);
    } catch (error) {
      if (error instanceof HttpException) throw error;
    }

    let enforcementOn = false;
    try {
      enforcementOn = await this.isEnforcementOn();
    } catch {
      return;
    }
    if (!enforcementOn) return;

    let user: User | null = null;
    try {
      const snap = await this.firebaseAdmin.firestore.collection('users').doc(uid).get();
      user = snap.exists ? (snap.data() as User) : null;
    } catch {
      this.logger.warn(`Consumption gate skipped uid=${uid} (user unreadable)`);
      return;
    }
    if (!user) return;

    let emailVerified = true;
    let emailCheckFailed = false;
    try {
      const record = await this.firebaseAdmin.auth.getUser(uid);
      emailVerified = Boolean(record.emailVerified);
    } catch {
      emailCheckFailed = true;
    }

    const decision = decideNewConsumption({
      enforcementOn: true,
      effectivePlan: resolveEffectivePlan(user.subscription),
      grantStatus: user.abuse?.grantStatus,
      cooldownEndsAt: user.abuse?.cooldownEndsAt ?? null,
      now: new Date(),
      emailVerified,
      emailCheckFailed,
      kind,
    });

    if (decision.action === 'allow') return;
    if (decision.action === 'promote') {
      await this.promoteGrant(uid, user);
      return;
    }
    this.logger.log(`Free consumption denied uid=${uid} code=${decision.code}`);
    throwAbuse(decision.code!);
  }

  async releaseFreeGrant(uid: string): Promise<User> {
    const snap = await this.firebaseAdmin.firestore.collection('users').doc(uid).get();
    if (!snap.exists) {
      throw new NotFoundException('User not found');
    }
    const user = snap.data() as User;
    const now = new Date();
    const abuse: UserAbuse = {
      ...(user.abuse ?? {
        deviceHash: null,
        ipHash: null,
        networkHash: null,
        riskScore: 0,
        riskBand: 'allow',
        riskSignals: [],
        scoredAt: now,
      }),
      grantStatus: 'granted',
      cooldownEndsAt: null,
    };
    await this.firebaseAdmin.firestore.collection('users').doc(uid).update({
      abuse,
      updatedAt: now,
    });
    if (abuse.deviceHash) {
      await this.markDeviceReceivedFree(abuse.deviceHash);
    }
    this.logger.log(`Free grant released uid=${uid}`);
    return { ...user, abuse, updatedAt: now };
  }

  /**
   * Idempotency for AI generate paths. Missing/invalid key runs the work.
   * A Firestore error fails open (runs the work) rather than blocking generation.
   */
  async withIdempotency<T>(uid: string, key: string | undefined, run: () => Promise<T>): Promise<T> {
    const token = typeof key === 'string' ? key.trim() : '';
    if (!/^[A-Za-z0-9._-]{8,128}$/.test(token)) {
      return run();
    }
    const id = `${uid}:${token}`;
    const ref = this.firebaseAdmin.firestore.collection(ABUSE_IDEMPOTENCY_COLLECTION).doc(id);
    try {
      const snap = await ref.get();
      const now = Date.now();
      if (snap.exists) {
        const data = snap.data() as { status?: string; createdAt?: string; result?: T };
        const created = data.createdAt ? Date.parse(data.createdAt) : NaN;
        if (Number.isFinite(created) && now - created < IDEMPOTENCY_TTL_MS) {
          if (data.status === 'done') return data.result as T;
          throwAbuse(ABUSE_CODE.IDEMPOTENCY_CONFLICT);
        }
      }
      await ref.set({ status: 'pending', createdAt: new Date(now).toISOString() });
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.logger.warn(`Idempotency store unreadable uid=${uid}; running without it`);
      return run();
    }

    try {
      const result = await run();
      try {
        await ref.set({
          status: 'done',
          createdAt: new Date().toISOString(),
          result,
        });
      } catch {
        // Persisting the result is best-effort.
      }
      return result;
    } catch (error) {
      try {
        await ref.delete();
      } catch {
        // Allow a retry after a failed generation.
      }
      throw error;
    }
  }

  private async promoteGrant(uid: string, user: User): Promise<void> {
    const now = new Date();
    const abuse: UserAbuse = {
      ...(user.abuse as UserAbuse),
      grantStatus: 'eligible',
      cooldownEndsAt: null,
    };
    await this.firebaseAdmin.firestore.collection('users').doc(uid).update({
      abuse,
      updatedAt: now,
    });
    if (abuse.deviceHash) {
      await this.markDeviceReceivedFree(abuse.deviceHash);
    }
    this.logger.log(`Step-up cooldown elapsed uid=${uid} grant=eligible`);
  }

  private async markDeviceReceivedFree(hash: string): Promise<void> {
    try {
      const previous = await this.readDevice(hash);
      if (!previous || previous.receivedFree) return;
      await this.firebaseAdmin.firestore.collection(ABUSE_DEVICES_COLLECTION).doc(hash).set({
        ...previous,
        receivedFree: true,
      });
    } catch {
      // A lookup miss must not fail the grant release.
    }
  }

  private async assertUidRate(uid: string, kind: ConsumptionKind): Promise<void> {
    const limit = UID_RATE_LIMITS[kind];
    const ref = this.firebaseAdmin.firestore.collection(ABUSE_RATE_COLLECTION).doc(`${uid}:${kind}`);
    const snap = await ref.get();
    const now = Date.now();
    const hits = (
      snap.exists && Array.isArray((snap.data() as { hits?: unknown })?.hits)
        ? ((snap.data() as { hits: number[] }).hits as number[])
        : []
    ).filter((t) => typeof t === 'number' && now - t < UID_RATE_WINDOW_MS);
    if (hits.length >= limit) {
      this.logger.warn(`Per-uid rate cap uid=${uid} kind=${kind}`);
      throwAbuse(ABUSE_CODE.UID_RATE_LIMIT);
    }
    hits.push(now);
    await ref.set({ hits });
  }
}
