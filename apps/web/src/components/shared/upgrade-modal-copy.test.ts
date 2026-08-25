import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SubscriptionPlan, templateFeatureLine } from '@flacroncv/shared-types';

/**
 * The upgrade-modal sentence interpolates `template_reach.{tier}`. English
 * must stay identical to `templateFeatureLine` so the paragraph cannot
 * contradict the PLAN_CONFIGS bullets under it.
 */
describe('upgrade_modal.template_reach', () => {
  it('English labels match templateFeatureLine for every plan', () => {
    const en = JSON.parse(
      readFileSync(join(__dirname, '../../../public/locales/en/common.json'), 'utf8'),
    ) as { upgrade_modal: { template_reach: Record<string, string> } };

    for (const plan of Object.values(SubscriptionPlan)) {
      expect(en.upgrade_modal.template_reach[plan]).toBe(templateFeatureLine(plan));
    }
  });
});
