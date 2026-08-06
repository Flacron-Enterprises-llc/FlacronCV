import {
  SubscriptionPlan,
  planMeetsTier,
  canUseCvLayout,
  canUseCoverLetterTemplate,
  effectiveCvLayout,
  effectiveCoverLetterTemplate,
} from '@flacroncv/shared-types';

const { FREE, PRO, ENTERPRISE } = SubscriptionPlan;

describe('template tier helpers', () => {
  describe('planMeetsTier (free < pro < enterprise)', () => {
    it('free meets only free', () => {
      expect(planMeetsTier(FREE, FREE)).toBe(true);
      expect(planMeetsTier(FREE, PRO)).toBe(false);
      expect(planMeetsTier(FREE, ENTERPRISE)).toBe(false);
    });
    it('pro meets free + pro, not enterprise', () => {
      expect(planMeetsTier(PRO, FREE)).toBe(true);
      expect(planMeetsTier(PRO, PRO)).toBe(true);
      expect(planMeetsTier(PRO, ENTERPRISE)).toBe(false);
    });
    it('enterprise meets everything', () => {
      expect(planMeetsTier(ENTERPRISE, FREE)).toBe(true);
      expect(planMeetsTier(ENTERPRISE, PRO)).toBe(true);
      expect(planMeetsTier(ENTERPRISE, ENTERPRISE)).toBe(true);
    });
  });

  describe('canUseCvLayout', () => {
    it('free layouts (classic/sidebar/compact) are usable by everyone', () => {
      for (const l of ['classic', 'sidebar', 'compact']) {
        expect(canUseCvLayout(l, FREE)).toBe(true);
      }
    });
    it('top-bar and slate-gold require PRO', () => {
      expect(canUseCvLayout('top-bar', FREE)).toBe(false);
      expect(canUseCvLayout('slate-gold', FREE)).toBe(false);
      expect(canUseCvLayout('top-bar', PRO)).toBe(true);
      expect(canUseCvLayout('slate-gold', ENTERPRISE)).toBe(true);
    });
    it('unknown layout is treated as free (not a paywall lever)', () => {
      expect(canUseCvLayout('mystery', FREE)).toBe(true);
    });
  });

  describe('canUseCoverLetterTemplate', () => {
    it('classic/modern are free; minimalist/creative are PRO; corporate/executive are ENTERPRISE', () => {
      expect(canUseCoverLetterTemplate('classic', FREE)).toBe(true);
      expect(canUseCoverLetterTemplate('minimalist', FREE)).toBe(false);
      expect(canUseCoverLetterTemplate('minimalist', PRO)).toBe(true);
      expect(canUseCoverLetterTemplate('corporate', PRO)).toBe(false);
      expect(canUseCoverLetterTemplate('corporate', ENTERPRISE)).toBe(true);
    });
  });

  describe('effectiveCvLayout (graceful fallback)', () => {
    it('keeps an affordable layout', () => {
      expect(effectiveCvLayout('slate-gold', PRO)).toBe('slate-gold');
      expect(effectiveCvLayout('compact', FREE)).toBe('compact');
    });
    it('falls back to classic when the plan cannot afford the stored layout', () => {
      expect(effectiveCvLayout('slate-gold', FREE)).toBe('classic');
      expect(effectiveCvLayout('top-bar', FREE)).toBe('classic');
    });
    it('unknown or empty layout falls back to classic', () => {
      expect(effectiveCvLayout('mystery', PRO)).toBe('classic');
      expect(effectiveCvLayout(null, PRO)).toBe('classic');
    });
  });

  describe('effectiveCoverLetterTemplate (graceful fallback)', () => {
    it('keeps an affordable template', () => {
      expect(effectiveCoverLetterTemplate('corporate', ENTERPRISE)).toBe('corporate');
      expect(effectiveCoverLetterTemplate('classic', FREE)).toBe('classic');
    });
    it('falls back to modern when the plan cannot afford the stored template', () => {
      expect(effectiveCoverLetterTemplate('corporate', FREE)).toBe('modern');
      expect(effectiveCoverLetterTemplate('minimalist', FREE)).toBe('modern');
      expect(effectiveCoverLetterTemplate('corporate', PRO)).toBe('modern');
    });
  });
});
