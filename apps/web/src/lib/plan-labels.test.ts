import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SubscriptionPlan } from '@flacroncv/shared-types';
import { ADMIN_PLAN_OPTIONS, crmPlanLabel, planBadgeClass, PLAN_BADGE_CLASSES } from './plan-labels';

const LOCALES = ['en', 'fr', 'de', 'es', 'ar', 'ur'];
const read = (loc: string) =>
  JSON.parse(readFileSync(join(__dirname, `../../public/locales/${loc}/common.json`), 'utf8')) as Record<string, any>;

describe('admin / CRM plan labels', () => {
  const en = read('en');
  const t = (key: string, values?: Record<string, string | number>) =>
    String(en.crm[key]).replace(/\{(\w+)\}/g, (_, k) => String(values?.[k] ?? ''));

  it('lists every plan, current first then legacy', () => {
    expect(ADMIN_PLAN_OPTIONS).toEqual([
      'free', 'starter', 'professional', 'career_pro', 'business', 'pro', 'career_accelerator', 'enterprise',
    ]);
  });

  it('marks legacy plans, names current ones plainly, keeps unknown values', () => {
    expect(crmPlanLabel(t, 'professional')).toBe('Professional');
    expect(crmPlanLabel(t, 'pro')).toBe('Pro (legacy)');
    expect(crmPlanLabel(t, 'enterprise')).toBe('Enterprise (legacy)');
    expect(crmPlanLabel(t, undefined)).toBe('Free');
    expect(crmPlanLabel(t, 'platinum')).toBe('platinum');
  });

  it('every plan has a crm + pricing name in all six locales', () => {
    for (const loc of LOCALES) {
      const j = read(loc);
      for (const plan of Object.values(SubscriptionPlan)) {
        expect(typeof j.crm[`plan_${plan}`], `${loc} crm.plan_${plan}`).toBe('string');
        expect(typeof j.pricing[plan], `${loc} pricing.${plan}`).toBe('string');
      }
      expect(j.crm.plan_legacy_label).toContain('{plan}');
    }
  });

  it('has a badge colour for every plan', () => {
    for (const plan of Object.values(SubscriptionPlan)) expect(PLAN_BADGE_CLASSES[plan]).toBeTruthy();
    expect(planBadgeClass('nope')).toBe(PLAN_BADGE_CLASSES.free);
  });
});
