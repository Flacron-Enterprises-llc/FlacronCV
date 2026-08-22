import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { PLAN_CONFIGS, SubscriptionPlan, customerFacingPlans } from '@flacroncv/shared-types';
import {
  faqPage,
  organizationAndWebsite,
  pageBreadcrumbs,
  softwareApplication,
} from '@/lib/json-ld';
import { SITE_URL } from '@/lib/seo';

describe('faqPage', () => {
  const free = PLAN_CONFIGS[SubscriptionPlan.FREE].limits;
  const pro = PLAN_CONFIGS[SubscriptionPlan.PRO].limits;
  const schema = faqPage();
  const answers = schema.mainEntity.map((q) => q.acceptedAnswer.text).join('\n');

  it('interpolates current FREE and PRO limits rather than restating them', () => {
    expect(answers).toContain(`${free.cvs} CVs`);
    expect(answers).toContain(
      `${free.coverLetters} ${free.coverLetters === 1 ? 'cover letter' : 'cover letters'}`,
    );
    expect(answers).toContain(`${free.aiCredits} AI credits`);
    expect(answers).not.toContain(`${free.aiCredits} AI credits/month`);
    expect(answers).not.toContain(`${free.exports} documents/month`);
    expect(answers).not.toContain(`${free.exports} exports/month`);
    expect(answers).toContain('those allowances never reset');
    expect(answers).toContain(`${pro.cvs} CVs/month`);
    expect(answers).toContain(`${pro.coverLetters} cover letters/month`);
    expect(answers).toContain(`${pro.aiCredits} AI credits/month`);
  });

  it('does not restate a limit as a numeric literal in the builder source', () => {
    // The whole point of reading PLAN_CONFIGS is that this file must not contain
    // the numbers it is interpolating. If a future edit pastes "5 CVs" back in,
    // the interpolation still looks right today and the drift only appears when
    // the config moves.
    const src = readFileSync(join(__dirname, 'json-ld.ts'), 'utf8');
    const start = src.indexOf('export function faqPage');
    const next = src.indexOf('\nexport ', start + 1);
    const body = src.slice(start, next === -1 ? undefined : next);
    for (const n of [free.cvs, free.coverLetters, free.aiCredits, free.exports, pro.cvs, pro.coverLetters, pro.aiCredits]) {
      expect(body).not.toMatch(new RegExp(`\\b${n}\\b`));
    }
  });
});

describe('softwareApplication', () => {
  const schema = softwareApplication();

  it('omits aggregateRating — we have no real reviews', () => {
    expect(schema).not.toHaveProperty('aggregateRating');
    expect(JSON.stringify(schema)).not.toContain('aggregateRating');
  });

  it('prices offers from PLAN_CONFIGS for customer-facing plans only', () => {
    const byName = Object.fromEntries(schema.offers.map((o) => [o.name, o.price]));
    const visible = customerFacingPlans();
    expect(schema.offers).toHaveLength(visible.length);
    for (const plan of visible) {
      expect(byName[PLAN_CONFIGS[plan].name]).toBe(String(PLAN_CONFIGS[plan].priceMonthly));
    }
    expect(byName[PLAN_CONFIGS[SubscriptionPlan.CAREER_ACCELERATOR].name]).toBeUndefined();
  });
});

describe('organizationAndWebsite', () => {
  it('uses the canonical origin, not a relative path', () => {
    const schema = organizationAndWebsite('fr');
    expect(schema['@graph'][0].url).toBe(SITE_URL);
    expect(schema['@graph'][1].inLanguage).toBe('fr');
  });
});

describe('pageBreadcrumbs', () => {
  it('starts at home and names the page', () => {
    const schema = pageBreadcrumbs('es', 'Inicio', 'Sobre nosotros', '/about-us');
    expect(schema.itemListElement).toEqual([
      { '@type': 'ListItem', position: 1, name: 'Inicio', item: `${SITE_URL}/es` },
      {
        '@type': 'ListItem',
        position: 2,
        name: 'Sobre nosotros',
        item: `${SITE_URL}/es/about-us`,
      },
    ]);
  });
});
