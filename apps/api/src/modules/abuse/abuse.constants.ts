import {
  AbuseRiskSettings,
  AbuseRiskThresholds,
  AbuseRiskWeights,
} from '@flacroncv/shared-types';

export const DEFAULT_ABUSE_WEIGHTS: AbuseRiskWeights = {
  identityReceivedFree: 80,
  deviceReceivedFree: 50,
  multipleAccountsDevice: 45,
  networkBurst: 35,
  disposableEmail: 25,
  botActivity: 50,
  vpnDatacenter: 0,
  repeatCreateDelete: 40,
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
};

export const ABUSE_DEVICES_COLLECTION = 'abuse_devices';
export const ABUSE_NETWORKS_COLLECTION = 'abuse_networks';
export const APP_SETTINGS_COLLECTION = 'app_settings';
export const APP_SETTINGS_DOC = 'main';

export const DEVICE_UID_CAP = 20;
export const NETWORK_RECENT_CAP = 50;
export const DEVICE_TOKEN_RE = /^[0-9a-f]{32}$/i;
