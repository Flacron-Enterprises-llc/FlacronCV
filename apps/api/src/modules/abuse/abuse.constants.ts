import {
  AbuseRiskSettings,
  AbuseRiskThresholds,
  AbuseRiskWeights,
} from '@flacroncv/shared-types';

/**
 * Part 1 (observe-only) weights were: identity 80, device 50, multiple 45
 * (stacked with identity → 125), network 35, disposable 25, bot 50 (empty UA
 * fired), VPN 0, repeat-create-delete 40.
 *
 * Those numbers would deny a second person on a shared family PC (identity 80
 * + multiple 45 = 125) — exactly the household the client’s section 4
 * protects. Do not “restore” the part-1 values thinking they were tuned for
 * enforcement. See PROJECT_PROGRESS.md Batch G part 2.
 */
export const DEFAULT_ABUSE_WEIGHTS: AbuseRiskWeights = {
  identityReceivedFree: 55,
  deviceReceivedFree: 50,
  multipleAccountsDevice: 25,
  networkBurst: 35,
  disposableEmail: 25,
  botActivity: 20,
  vpnDatacenter: 0,
  repeatCreateDelete: 25,
};

export const DEFAULT_ABUSE_THRESHOLDS: AbuseRiskThresholds = {
  allowBelow: 40,
  denyAt: 70,
  ipAloneMax: 39,
};

export const DEFAULT_ABUSE_SETTINGS: AbuseRiskSettings = {
  weights: DEFAULT_ABUSE_WEIGHTS,
  thresholds: DEFAULT_ABUSE_THRESHOLDS,
  networkBurstCount: 3,
  networkBurstWindowHours: 24,
  // Kill switch. A missing settings doc must not start denying.
  enforcementEnabled: false,
  stepUpCooldownHours: 12,
};

export const ABUSE_DEVICES_COLLECTION = 'abuse_devices';
export const ABUSE_NETWORKS_COLLECTION = 'abuse_networks';
export const ABUSE_IDEMPOTENCY_COLLECTION = 'abuse_idempotency';
export const ABUSE_RATE_COLLECTION = 'abuse_rate';
export const APP_SETTINGS_COLLECTION = 'app_settings';
export const APP_SETTINGS_DOC = 'main';

export const DEVICE_UID_CAP = 20;
export const NETWORK_RECENT_CAP = 50;
export const DEVICE_TOKEN_RE = /^[0-9a-f]{32}$/i;

/** New Firestore user creates per hashed network per rolling hour. */
export const NETWORK_CREATE_PER_HOUR = 10;
export const IDEMPOTENCY_TTL_MS = 15 * 60 * 1000;
export const UID_RATE_WINDOW_MS = 15 * 60 * 1000;
export const UID_RATE_LIMITS = {
  create: 20,
  ai: 30,
  export: 20,
} as const;
