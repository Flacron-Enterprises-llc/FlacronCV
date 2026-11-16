import { describe, expect, it } from 'vitest';
import { ALLOWANCES, PLANS } from '../../../../packages/career-shared/src/catalog';
import {
  COMPARISON_ROWS,
  DEFINED_UNITS,
  PRICING_PLANS,
  RECOMMENDED_PLAN,
  cardFacts,
  cardPrice,
  catalogTrialDays,
  cellState,
  cellText,
  equivalentPlan,
  featureState,
  isLegacyPlan,
  isPricingPlan,
  lowestPlanMeeting,
  nextPlanUp,
  planBenefits,
  planLabel,
  planName,
  rowLabel,
  soldInStore,
  templateTierOfPlan,
  usd,
} from './plan-catalog';

describe('plan catalog (five plans)', () => {
  it('lists the five plans in order with Professional recommended', () => {
    expect(PRICING_PLANS).toEqual(['free', 'starter', 'professional', 'career_pro', 'business']);
    expect(RECOMMENDED_PLAN).toBe('professional');
    expect(PRICING_PLANS.map(planName)).toEqual(['Free', 'Starter', 'Professional', 'Career Pro', 'Business']);
  });

  it('knows the legacy plans and their five-plan equivalents', () => {
    expect(isLegacyPlan('pro')).toBe(true);
    expect(isLegacyPlan('enterprise')).toBe(true);
    expect(isLegacyPlan('starter')).toBe(false);
    expect(isPricingPlan('career_pro')).toBe(true);
    expect(isPricingPlan('pro')).toBe(false);
    expect(equivalentPlan('pro')).toBe('starter');
    expect(equivalentPlan('career_accelerator')).toBe('professional');
    expect(equivalentPlan('enterprise')).toBe('career_pro');
    expect(equivalentPlan(undefined)).toBe('free');
    expect(equivalentPlan('nonsense')).toBe('free');
    expect(planLabel('pro')).toBe('Pro (legacy) — your price is kept');
    expect(planLabel('starter')).toBe('Starter');
  });

  it('offers the next plan up, nothing above Business', () => {
    expect(nextPlanUp('free')).toBe('starter');
    expect(nextPlanUp('starter')).toBe('professional');
    expect(nextPlanUp('pro')).toBe('professional');
    expect(nextPlanUp('enterprise')).toBe('business');
    expect(nextPlanUp('business')).toBeNull();
  });

  it('ranks template tiers with planMeetsTier, not a plan-order index', () => {
    // The website once used PLAN_ORDER.indexOf('pro') (= -1) and offered Free for a Pro template.
    expect(lowestPlanMeeting('pro')).toBe('starter');
    expect(lowestPlanMeeting('enterprise')).toBe('career_pro');
    expect(lowestPlanMeeting('career_accelerator')).toBe('career_pro');
    expect(lowestPlanMeeting('free')).toBe('free');
    expect(lowestPlanMeeting('professional')).toBe('professional');
    expect(lowestPlanMeeting(null)).toBeNull();
    expect(templateTierOfPlan('starter')).toBe('pro');
    expect(templateTierOfPlan('business')).toBe('enterprise');
  });

  it('sells Business on the website only and trials Professional only', () => {
    expect(soldInStore('business', 'monthly', 'apple')).toBe(false);
    expect(soldInStore('business', 'annual', 'google')).toBe(false);
    expect(soldInStore('starter', 'annual', 'apple')).toBe(true);
    expect(soldInStore('free', 'monthly', 'google')).toBe(false);
    expect(catalogTrialDays('professional', 'monthly')).toBe(7);
    expect(catalogTrialDays('starter', 'monthly')).toBeNull();
  });

  it('prices cards from the catalog, or with the store price when it loaded', () => {
    expect(usd(0)).toBe('$0');
    expect(usd(PLANS.starter.monthlyCents)).toBe('$21.99');
    const monthly = cardPrice('starter', 'monthly');
    expect(monthly.headline).toBe('$21.99');
    expect(monthly.suffix).toBe('/month');
    expect(monthly.notes).toEqual(['or $219.90 a year, paid upfront']);
    const annual = cardPrice('professional', 'annual');
    expect(annual.headline).toBe('$389.90');
    expect(annual.notes).toContain('Allowances still renew monthly.');
    const store = cardPrice('career_pro', 'monthly', '€74,99');
    expect(store.headline).toBe('€74,99');
    expect(store.notes).toEqual([]);
    expect(cardPrice('free', 'annual').suffix).toBe('no card needed');
  });

  it('words comparison cells like the website', () => {
    expect(COMPARISON_ROWS).toHaveLength(33);
    for (const row of COMPARISON_ROWS) expect(rowLabel(row)).not.toBe(`plans.rows.${row}`);
    expect(cellText('documentCredits', 'professional')).toEqual({ included: true, text: String(ALLOWANCES.professional.documentCredits) });
    expect(cellText('docxExport', 'free')).toEqual({ included: false, text: 'Not included' });
    expect(cellText('docxExport', 'starter')).toEqual({ included: true, text: 'Yes' });
    expect(cellText('storageBytes', 'free').text).toBe('100 MB');
    expect(cellText('matchingSchedule', 'free').text).toBe('Weekly');
    expect(cellText('localRadiusMiles', 'free').text).toBe('25 miles');
    expect(cellText('resumeVersions', 'business').text).toMatch(/per candidate/);
    expect(DEFINED_UNITS.every((unit) => (COMPARISON_ROWS as readonly string[]).includes(unit))).toBe(true);
  });

  it('marks feature states (coming soon / provider dependent) as the website does', () => {
    expect(featureState('voiceMinutes', true)).toBe('provider_dependent');
    // The career coach is built (needs the AI service, like every AI feature, shown as available).
    expect(featureState('coachingResponses', true)).toBe('available');
    // Licensed job feeds are not live: these rows need a connected provider on every plan.
    for (const row of ['alertItems', 'savedSearches', 'matchingSchedule', 'alertDelivery'] as const) {
      for (const plan of PRICING_PLANS) expect([row, plan, cellState(row, plan, true)]).toEqual([row, plan, 'provider_dependent']);
    }
    expect(featureState('documentCredits', false)).toBe('available');
    expect(featureState('alertItems', false)).toBe('coming_soon');
    expect(cellState('alertIntelligence', 'business', true)).toBe('coming_soon');
    expect(cellState('alertIntelligence', 'free', true)).toBe('available');
  });

  it('builds card facts and upgrade benefits from the catalog', () => {
    const facts = cardFacts('professional', true);
    expect(facts[0]).toEqual({ label: 'Document credits', value: String(ALLOWANCES.professional.documentCredits), state: 'available' });
    expect(facts.some((f) => f.label === 'Voice interview minutes / month' && f.state === 'provider_dependent')).toBe(true);
    expect(cardFacts('free', true).some((f) => f.label.startsWith('Voice'))).toBe(false);
    expect(facts.find((f) => f.label === 'Saved searches')?.state).toBe('provider_dependent');
    const benefits = planBenefits('starter');
    expect(benefits[0]).toBe(`${ALLOWANCES.starter.documentCredits} document credits a month`);
    expect(benefits).toContain('DOCX (Word) export');
    expect(benefits).toContain('Exports without the FlacronCV mark');
    expect(planBenefits('free')).not.toContain('DOCX (Word) export');
  });
});
