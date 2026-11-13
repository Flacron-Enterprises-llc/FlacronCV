import { describe, expect, it } from 'vitest';
import { ALLOWANCES, PLANS } from '../../../../../packages/career-shared/src/catalog';
import { formatUsd } from '../../../../../packages/career-shared/src/money';
import {
  CAREER_PLAN_IDS,
  careerPlanName,
  currentCareerPlan,
  PLAN_ROWS,
  planPrices,
  rowLabel,
  rowValue,
} from './plans';

describe('career plans comparison', () => {
  it('lists the five catalog plans in order', () => {
    expect(CAREER_PLAN_IDS).toEqual(['free', 'starter', 'professional', 'career_pro', 'business']);
    expect(CAREER_PLAN_IDS.map(careerPlanName)).toEqual(['Free', 'Starter', 'Professional', 'Career Pro', 'Business']);
  });

  it('uses the website pricing comparison rows (27, same order), each with a label', () => {
    expect(PLAN_ROWS).toHaveLength(27);
    expect(PLAN_ROWS[0]).toBe('documentCredits');
    expect(PLAN_ROWS[PLAN_ROWS.length - 1]).toBe('activeCandidates');
    for (const row of PLAN_ROWS) {
      expect(rowLabel(row)).not.toBe(`careerHub.plans.features.${row}`);
      expect(row in ALLOWANCES.free).toBe(true);
    }
  });

  it('every value is read from the catalog allowances and worded like the website', () => {
    for (const plan of CAREER_PLAN_IDS) {
      for (const row of PLAN_ROWS) {
        const raw = ALLOWANCES[plan][row];
        const value = rowValue(plan, row);
        const missing = raw === null || raw === false || raw === 'none';
        expect(value.included).toBe(!missing);
        if (typeof raw === 'number' && row !== 'localRadiusMiles') expect(value.text).toBe(raw.toLocaleString('en-US'));
        expect(value.text).not.toMatch(/^careerHub\./);
      }
    }
    expect(rowValue('professional', 'documentCredits')).toEqual({ included: true, text: '60' });
    expect(rowValue('career_pro', 'trackedApplications')).toEqual({ included: true, text: '2,000' });
    expect(rowValue('free', 'actionPacks')).toEqual({ included: false, text: 'Not included' });
    expect(rowValue('free', 'docxExport')).toEqual({ included: false, text: 'Not included' });
    expect(rowValue('starter', 'docxExport')).toEqual({ included: true, text: 'Yes' });
    expect(rowValue('starter', 'localRadiusMiles')).toEqual({ included: true, text: '50 miles' });
    expect(rowValue('professional', 'alertIntelligence')).toEqual({ included: true, text: 'Enhanced fit and gaps' });
    expect(rowValue('free', 'alertDelivery')).toEqual({ included: true, text: 'Weekly email digest' });
    expect(rowValue('starter', 'applicationAnalytics')).toEqual({ included: true, text: 'Basic counts' });
    expect(rowValue('free', 'portfolioAnalytics')).toEqual({ included: false, text: 'Not included' });
    expect(rowValue('business', 'staffSeats')).toEqual({ included: true, text: '3' });
  });

  it('prices are the exact catalog amounts', () => {
    for (const plan of CAREER_PLAN_IDS) {
      expect(planPrices(plan)).toEqual({ monthly: formatUsd(PLANS[plan].monthlyCents), annual: formatUsd(PLANS[plan].annualCents) });
    }
    expect(planPrices('starter')).toEqual({ monthly: '$21.99', annual: '$219.90' });
    expect(planPrices('business')).toEqual({ monthly: '$208.00', annual: '$2,080.00' });
  });

  it('highlights the plan the career service reports, and none without access', () => {
    expect(currentCareerPlan({ enabled: true, v1Plan: 'pro', careerPlan: 'professional', features: {} })).toBe('professional');
    expect(currentCareerPlan({ enabled: false, v1Plan: 'free', careerPlan: 'free', features: {}, reason: 'plan_not_mapped' })).toBeNull();
    expect(currentCareerPlan({ enabled: true, v1Plan: 'pro', careerPlan: 'unknown', features: {} })).toBeNull();
    expect(currentCareerPlan(undefined)).toBeNull();
  });
});
