import {
  AbuseRiskSettings,
  RiskBand,
  RiskSignalCode,
} from '@flacroncv/shared-types';
import { DEFAULT_ABUSE_SETTINGS } from './abuse.constants';

export interface RiskFlags {
  identityReceivedFree: boolean;
  deviceReceivedFree: boolean;
  multipleAccountsDevice: boolean;
  networkBurst: boolean;
  disposableEmail: boolean;
  botActivity: boolean;
  vpnDatacenter: boolean;
  repeatCreateDelete: boolean;
}

export interface RiskResult {
  score: number;
  band: RiskBand;
  signals: RiskSignalCode[];
}

export function mergeAbuseSettings(raw: unknown): AbuseRiskSettings {
  const src =
    raw && typeof raw === 'object' ? (raw as Partial<AbuseRiskSettings>) : {};
  const weightsIn =
    src.weights && typeof src.weights === 'object' ? src.weights : {};
  const thresholdsIn =
    src.thresholds && typeof src.thresholds === 'object' ? src.thresholds : {};
  return {
    weights: { ...DEFAULT_ABUSE_SETTINGS.weights, ...weightsIn },
    thresholds: { ...DEFAULT_ABUSE_SETTINGS.thresholds, ...thresholdsIn },
    networkBurstCount:
      typeof src.networkBurstCount === 'number' && src.networkBurstCount > 0
        ? src.networkBurstCount
        : DEFAULT_ABUSE_SETTINGS.networkBurstCount,
    networkBurstWindowHours:
      typeof src.networkBurstWindowHours === 'number' && src.networkBurstWindowHours > 0
        ? src.networkBurstWindowHours
        : DEFAULT_ABUSE_SETTINGS.networkBurstWindowHours,
    // Only the explicit boolean true turns enforcement on. Missing, false,
    // "true", 1 — all fail open.
    enforcementEnabled: src.enforcementEnabled === true,
    stepUpCooldownHours:
      typeof src.stepUpCooldownHours === 'number' && src.stepUpCooldownHours > 0
        ? src.stepUpCooldownHours
        : DEFAULT_ABUSE_SETTINGS.stepUpCooldownHours,
  };
}

function bandFor(score: number, allowBelow: number, denyAt: number): RiskBand {
  if (score < allowBelow) return 'allow';
  if (score < denyAt) return 'verify';
  return 'deny';
}

/**
 * Pure scorer. IP is never a decision by itself: if the only firing signal is
 * `network_burst`, the score is clamped to `ipAloneMax` (default 39 → allow).
 *
 * `identity_received_free` and `device_received_free` are the same underlying
 * fact on a new uid (the device lookup). Identity takes precedence so they
 * are not summed.
 *
 * `multiple_accounts_device` is the same household fact as identity on a
 * shared laptop. It must not stack with `identity_received_free` or a second
 * family member lands at 80 (deny). The signal is still recorded for CRM.
 *
 * vpnDatacenter stays weight 0 until a dataset exists — the flag may still
 * be passed but it will not move the score.
 */
export function computeRiskScore(
  flags: RiskFlags,
  settings: AbuseRiskSettings = DEFAULT_ABUSE_SETTINGS,
): RiskResult {
  const { weights, thresholds } = settings;
  const signals: RiskSignalCode[] = [];
  let score = 0;

  if (flags.identityReceivedFree) {
    signals.push('identity_received_free');
    score += weights.identityReceivedFree;
  } else if (flags.deviceReceivedFree) {
    signals.push('device_received_free');
    score += weights.deviceReceivedFree;
  }

  if (flags.multipleAccountsDevice) {
    signals.push('multiple_accounts_device');
    // Same underlying fact as identity on a shared device — do not stack.
    if (!flags.identityReceivedFree) {
      score += weights.multipleAccountsDevice;
    }
  }
  if (flags.networkBurst) {
    signals.push('network_burst');
    score += weights.networkBurst;
  }
  if (flags.disposableEmail) {
    signals.push('disposable_email');
    score += weights.disposableEmail;
  }
  if (flags.botActivity) {
    signals.push('bot_activity');
    score += weights.botActivity;
  }
  if (flags.vpnDatacenter) {
    signals.push('vpn_datacenter');
    score += weights.vpnDatacenter;
  }
  if (flags.repeatCreateDelete) {
    signals.push('repeat_create_delete');
    score += weights.repeatCreateDelete;
  }

  if (signals.length === 1 && signals[0] === 'network_burst') {
    score = Math.min(score, thresholds.ipAloneMax);
  }

  if (score < 0) score = 0;

  return {
    score,
    band: bandFor(score, thresholds.allowBelow, thresholds.denyAt),
    signals,
  };
}
