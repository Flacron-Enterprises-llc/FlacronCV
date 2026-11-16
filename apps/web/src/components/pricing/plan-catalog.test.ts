import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/api', () => ({ api: { get: vi.fn() } }));
import { normalizePlansResponse, planOnSale, addonOnSale, addonBlock, addonBlockKey, NOTHING_ON_SALE, anyAddonOnSale } from './plan-availability';
import { COMPARISON_ROWS, PRICING_PLANS, cellState, equivalentPlan, featureState, isLegacyPlan, nextPlanUp } from './plan-catalog';

describe('plan catalog', () => {
  it('offers exactly the five plans, never a legacy one', () => {
    expect(PRICING_PLANS).toEqual(['free', 'starter', 'professional', 'career_pro', 'business']);
    for (const legacy of ['pro', 'career_accelerator', 'enterprise']) {
      expect(isLegacyPlan(legacy)).toBe(true);
      expect(PRICING_PLANS).not.toContain(legacy);
    }
  });

  it('upgrades to the next of the five plans; legacy plans count as their equivalent tier', () => {
    expect(nextPlanUp('free')).toBe('starter');
    expect(nextPlanUp(undefined)).toBe('starter');
    expect(nextPlanUp('professional')).toBe('career_pro');
    expect(nextPlanUp('business')).toBeNull();
    expect(equivalentPlan('pro')).toBe('starter');
    expect(nextPlanUp('pro')).toBe('professional');
    expect(nextPlanUp('enterprise')).toBe('business');
  });

  it('covers every spec §6/§7 row, including the ones the old table missed', () => {
    for (const row of ['matchingSchedule', 'followedCompanies', 'storageBytes', 'careerProfiles', 'removeExportBranding', 'specialistModes', 'mapSessions', 'localRadiusMiles', 'scenarioReports', 'applicationAnalytics'] as const) {
      expect(COMPARISON_ROWS).toContain(row);
    }
  });

  it('marks unbuilt and provider-dependent features honestly', () => {
    expect(featureState('voiceMinutes', true)).toBe('provider_dependent');
    expect(featureState('mapSessions', true)).toBe('provider_dependent');
    expect(featureState('coachingResponses', true)).toBe('available');
    expect(featureState('assistedForms', true)).toBe('coming_soon');
    expect(featureState('documentCredits', true)).toBe('available');
    // Advanced alert intelligence and push/Telegram delivery, per plan.
    expect(cellState('alertIntelligence', 'professional', true)).toBe('available');
    expect(cellState('alertIntelligence', 'career_pro', true)).toBe('coming_soon');
    // Alert delivery matches licensed job-feed listings (none live yet): every level waits for the provider,
    // and push/Telegram/immediate mail need their own provider on top.
    expect(cellState('alertDelivery', 'starter', true)).toBe('provider_dependent');
    expect(cellState('alertDelivery', 'professional', true)).toBe('provider_dependent');
  });

  it('marks the rows that need licensed job feeds as provider-dependent on every plan', () => {
    for (const row of ['alertItems', 'savedSearches', 'matchingSchedule', 'alertDelivery'] as const) {
      expect([row, featureState(row, true)]).toEqual([row, 'provider_dependent']);
      for (const plan of PRICING_PLANS) expect([row, plan, cellState(row, plan, true)]).toEqual([row, plan, 'provider_dependent']);
      // Switched off, they read as coming soon like every career row.
      expect(featureState(row, false)).toBe('coming_soon');
    }
    // Rows that do not depend on feeds stay available.
    expect(featureState('trackedApplications', true)).toBe('available');
    expect(featureState('locationProfiles', true)).toBe('available');
  });

  it('reads career rows as coming soon while the career tools are switched off, CV rows stay available', () => {
    expect(featureState('alertItems', false)).toBe('coming_soon');
    expect(featureState('docxExport', false)).toBe('available');
    expect(featureState('documentCredits', false)).toBe('available');
  });
});

describe('plan availability adapter (GET /plans)', () => {
  it('fails closed: nothing paid is on sale without an answer', () => {
    expect(planOnSale(NOTHING_ON_SALE, 'free', 'monthly')).toBe(true);
    expect(planOnSale(NOTHING_ON_SALE, 'professional', 'monthly')).toBe(false);
    expect(anyAddonOnSale(NOTHING_ON_SALE)).toBe(false);
  });

  it('reads per-interval flags in the shapes the API may send', () => {
    const a = normalizePlansResponse({
      catalogVersion: '2026-10-10',
      plans: [
        { id: 'starter', intervals: { monthly: { configured: true }, annual: { configured: false } } },
        { id: 'professional', configured: { monthly: true, annual: true } },
        { id: 'career_pro', monthlyConfigured: true, yearlyConfigured: true },
        { id: 'business', configured: true },
        { id: 'pro', configured: true },
      ],
      packs: [{ id: 'document_s', configured: true, available: true }, { id: 'nonsense', configured: true, available: true }, { id: 'voice_s', onSale: false }],
    });
    expect(a.catalogVersion).toBe('2026-10-10');
    expect(a.plans.starter).toEqual({ monthly: true, annual: false });
    expect(a.plans.professional).toEqual({ monthly: true, annual: true });
    expect(a.plans.career_pro).toEqual({ monthly: true, annual: true });
    expect(a.plans.business).toEqual({ monthly: true, annual: true });
    expect(a.plans).not.toHaveProperty('pro');
    expect(addonOnSale(a, 'document_s')).toBe(true);
    expect(addonOnSale(a, 'voice_s')).toBe(false);
    expect(a.addons).not.toHaveProperty('nonsense');
  });

  it('treats anything but an explicit true as not configured', () => {
    const a = normalizePlansResponse({ plans: [{ id: 'starter', configured: 'yes' }, { id: 'professional' }] });
    expect(planOnSale(a, 'starter', 'monthly')).toBe(false);
    expect(planOnSale(a, 'professional', 'annual')).toBe(false);
    expect(normalizePlansResponse(null).plans.starter).toEqual({ monthly: false, annual: false });
  });
});

describe('GET /plans as the V1 API sends it', () => {
  it('reads configured.month / configured.year', () => {
    const a = normalizePlansResponse({
      yearlyBillingEnabled: true,
      plans: [
        { id: 'free', configured: { month: false, year: false } },
        { id: 'starter', configured: { month: true, year: false } },
        { id: 'business', configured: { month: true, year: true }, contactSales: true },
      ],
    });
    expect(planOnSale(a, 'free', 'monthly')).toBe(true);
    expect(a.plans.starter).toEqual({ monthly: true, annual: false });
    expect(a.plans.business).toEqual({ monthly: true, annual: true });
    expect(a.plans.professional).toEqual({ monthly: false, annual: false });
  });

  it('takes add-on sale state from the signed-in career billing status, each half failing closed', async () => {
    const { api } = await import('@/lib/api');
    const get = api.get as unknown as ReturnType<typeof vi.fn>;
    const { fetchPlanAvailability } = await import('./plan-availability');
    get.mockImplementation(async (path: string) => {
      if (path === '/plans') throw new Error('down');
      return {
        addons: [
          { id: 'document_s', onSale: true, allowed: true, available: true, unavailableReason: null },
          // Priced, but the server says the feature cannot be bought: never on sale, and the reason comes through.
          { id: 'voice_s', onSale: true, allowed: true, available: false, unavailableReason: 'provider_missing', unavailableProvider: 'speech' },
          { id: 'assisted_form_25', onSale: true, available: false, unavailableReason: 'not_built', unavailableProvider: null },
          // An older server without the availability field: closed.
          { id: 'map_200', onSale: true },
        ],
      };
    });
    const a = await fetchPlanAvailability(true);
    expect(a.source).toBe('unavailable');
    expect(planOnSale(a, 'starter', 'monthly')).toBe(false);
    expect(addonOnSale(a, 'document_s')).toBe(true);
    expect(addonOnSale(a, 'voice_s')).toBe(false);
    expect(addonBlock(a, 'voice_s')).toEqual({ reason: 'provider_missing', provider: 'speech' });
    expect(addonBlockKey(addonBlock(a, 'voice_s')!)).toBe('unavailable.provider_speech');
    expect(addonBlockKey(addonBlock(a, 'assisted_form_25')!)).toBe('unavailable.not_built');
    expect(addonOnSale(a, 'map_200')).toBe(false);
    expect(addonBlock(a, 'document_s')).toBeNull();
    get.mockReset();
    get.mockResolvedValue({ plans: [] });
    expect(anyAddonOnSale(await fetchPlanAvailability(false))).toBe(false);
    expect(get).toHaveBeenCalledTimes(1);
  });
});
