import { DEFAULT_ABUSE_SETTINGS } from './abuse.constants';
import { computeRiskScore, mergeAbuseSettings } from './abuse-score';

const none = {
  identityReceivedFree: false,
  deviceReceivedFree: false,
  multipleAccountsDevice: false,
  networkBurst: false,
  disposableEmail: false,
  botActivity: false,
  vpnDatacenter: false,
  repeatCreateDelete: false,
};

describe('computeRiskScore', () => {
  it('scores a clean registration as allow', () => {
    const result = computeRiskScore(none);
    expect(result.score).toBe(0);
    expect(result.band).toBe('allow');
    expect(result.signals).toEqual([]);
  });

  it('does not double-count identity and device received-Free', () => {
    const result = computeRiskScore({
      ...none,
      identityReceivedFree: true,
      deviceReceivedFree: true,
    });
    expect(result.signals).toEqual(['identity_received_free']);
    expect(result.score).toBe(DEFAULT_ABUSE_SETTINGS.weights.identityReceivedFree);
    expect(result.band).toBe('verify');
  });

  it('does not stack multiple-accounts with identity (family PC / client §4)', () => {
    const result = computeRiskScore({
      ...none,
      identityReceivedFree: true,
      deviceReceivedFree: true,
      multipleAccountsDevice: true,
    });
    expect(result.signals).toEqual(['identity_received_free', 'multiple_accounts_device']);
    expect(result.score).toBe(DEFAULT_ABUSE_SETTINGS.weights.identityReceivedFree);
    expect(result.score).toBeLessThan(DEFAULT_ABUSE_SETTINGS.thresholds.denyAt);
    expect(result.band).toBe('verify');
  });

  it('clamps a network-burst-only score to ipAloneMax so the band is allow', () => {
    const result = computeRiskScore({ ...none, networkBurst: true });
    expect(result.signals).toEqual(['network_burst']);
    expect(result.score).toBeLessThanOrEqual(DEFAULT_ABUSE_SETTINGS.thresholds.ipAloneMax);
    expect(result.score).toBeLessThan(DEFAULT_ABUSE_SETTINGS.thresholds.allowBelow);
    expect(result.band).toBe('allow');
  });

  it('does not clamp network burst when another signal also fires', () => {
    const result = computeRiskScore({
      ...none,
      networkBurst: true,
      disposableEmail: true,
    });
    expect(result.signals).toEqual(['network_burst', 'disposable_email']);
    expect(result.score).toBe(
      DEFAULT_ABUSE_SETTINGS.weights.networkBurst +
        DEFAULT_ABUSE_SETTINGS.weights.disposableEmail,
    );
  });

  it('vpn/datacenter at default weight 0 does not move the score', () => {
    const result = computeRiskScore({ ...none, vpnDatacenter: true });
    expect(result.signals).toEqual(['vpn_datacenter']);
    expect(result.score).toBe(0);
    expect(result.band).toBe('allow');
  });

  it('reads configured weights and thresholds instead of hardcoded bands', () => {
    const settings = mergeAbuseSettings({
      weights: { disposableEmail: 80 },
      thresholds: { allowBelow: 50, denyAt: 90, ipAloneMax: 10 },
    });
    const result = computeRiskScore({ ...none, disposableEmail: true }, settings);
    expect(result.score).toBe(80);
    expect(result.band).toBe('verify');
  });
});

describe('mergeAbuseSettings enforcementEnabled', () => {
  it('is false by default and for anything other than the boolean true', () => {
    expect(DEFAULT_ABUSE_SETTINGS.enforcementEnabled).toBe(false);
    expect(mergeAbuseSettings(undefined).enforcementEnabled).toBe(false);
    expect(mergeAbuseSettings({}).enforcementEnabled).toBe(false);
    expect(mergeAbuseSettings({ enforcementEnabled: false }).enforcementEnabled).toBe(false);
    expect(
      mergeAbuseSettings({ enforcementEnabled: 'true' as unknown as boolean }).enforcementEnabled,
    ).toBe(false);
  });

  it('is true only when the stored flag is the boolean true', () => {
    expect(mergeAbuseSettings({ enforcementEnabled: true }).enforcementEnabled).toBe(true);
  });
});
