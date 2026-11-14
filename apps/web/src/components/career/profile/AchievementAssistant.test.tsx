import { describe, expect, it } from 'vitest';
import messages from '../../../../public/locales/en/common.json';
import { achievementNeedsNumber } from './FactEditor';

describe('achievement assistant', () => {
  it('asks for a number only when the achievement has none and no metric, and never fills one in', () => {
    expect(achievementNeedsNumber('Made the monthly report faster', '')).toBe(true);
    expect(achievementNeedsNumber('Cut the monthly report from 3 days to 1', '')).toBe(false);
    expect(achievementNeedsNumber('Made the monthly report faster', '40% faster')).toBe(false);
    expect(achievementNeedsNumber('', '')).toBe(false);
    expect(messages.career.profile.achievement_prompt).toMatch(/never adds one/);
  });

  it('no longer says portfolios and career modes are not part of this version', () => {
    const profile = messages.career.profile as Record<string, string>;
    expect(profile.sharing_link).toBe('Open portfolios');
    expect(profile.mode_link).toBe('Open career modes');
  });
});
