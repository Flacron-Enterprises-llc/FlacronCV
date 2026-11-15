import { AxiosError, AxiosHeaders } from 'axios';
import { describe, expect, it } from 'vitest';
import { promptForApiError, reasonForApiError, upgradePrompt } from './upgrade-prompts';

function apiError(status: number, data: Record<string, unknown>): AxiosError {
  const headers = new AxiosHeaders();
  return new AxiosError('Request failed', 'ERR_BAD_REQUEST', { headers }, undefined, {
    status,
    statusText: '',
    headers,
    config: { headers },
    data,
  });
}

describe('API error codes → limit (website knownCodeMessage)', () => {
  it('maps the stable codes', () => {
    expect(reasonForApiError(apiError(403, { code: 'CV_LIMIT_REACHED', message: 'x' }))).toBe('cvs');
    expect(reasonForApiError(apiError(403, { code: 'JOB_CAPACITY_REACHED', message: 'x', limit: 25 }))).toBe('jobCapacity');
    expect(reasonForApiError(apiError(503, { code: 'ANALYSES_EXHAUSTED', message: 'x' }))).toBe('analyses');
    expect(reasonForApiError(apiError(503, { code: 'USAGE_METER_UNAVAILABLE', message: 'x' }))).toBe('meter');
    expect(reasonForApiError(apiError(503, { code: 'PLAN_NOT_CONFIGURED', message: 'x' }))).toBe('notOnSale');
    expect(reasonForApiError(apiError(403, { code: 'UPGRADE_REQUIRED', message: 'x', minimumPlan: 'professional' }))).toBe('feature');
  });

  it('falls back to the older English refusals', () => {
    expect(reasonForApiError(apiError(403, { message: 'DOCX export is not available on the free plan.' }))).toBe('docx');
    expect(reasonForApiError(apiError(403, { message: 'Cover letter limit reached. Please upgrade.' }))).toBe('coverLetters');
    expect(reasonForApiError(apiError(503, { message: 'Flacron Engine credits exhausted. Please upgrade your plan.' }))).toBe('aiCredits');
    expect(reasonForApiError(apiError(403, { message: 'Monthly export limit reached' }), 'export')).toBe('exports');
    expect(reasonForApiError(apiError(403, { message: 'Limit reached' }), 'coverLetters')).toBe('coverLetters');
    expect(reasonForApiError(apiError(500, { message: 'Internal server error' }))).toBeNull();
    expect(reasonForApiError(new Error('offline'))).toBeNull();
  });
});

describe('prompts', () => {
  it('states the capacity fact and offers the next plan only when the app can sell it', () => {
    const sell = upgradePrompt('cvs', { plan: 'free', canUpgrade: true });
    expect(sell.title).toBe('CV limit reached');
    expect(sell.offeredPlan).toBe('starter');
    expect(sell.message).toBe(
      'Your Free plan keeps one CV at a time. Delete one you no longer need to make room.\n\nStarter keeps up to 5 CVs.',
    );
    const info = upgradePrompt('cvs', { plan: 'free', canUpgrade: false });
    expect(info.message).not.toMatch(/Starter/);
  });

  it('legacy plans keep their per-month wording and are offered the next of the five plans', () => {
    const p = upgradePrompt('cvs', { plan: 'pro', canUpgrade: true });
    expect(p.message).toMatch(/^Your Pro plan allows 10 new CVs a month\./);
    expect(p.offeredPlan).toBe('professional');
  });

  it('DOCX starts on Starter', () => {
    const p = upgradePrompt('docx', { plan: 'free', canUpgrade: true });
    expect(p.message).toMatch(/DOCX \(Word\) export starts on Starter/);
    expect(p.offeredPlan).toBe('starter');
  });

  it('template tiers offer the lowest plan that includes them', () => {
    const pro = upgradePrompt('templates', { plan: 'free', canUpgrade: true, templateName: 'Executive', requiredTier: 'pro' });
    expect(pro.offeredPlan).toBe('starter');
    expect(pro.message).toMatch(/^Executive is included from the Starter plan\./);
    const ent = upgradePrompt('templates', { plan: 'starter', canUpgrade: true, templateName: 'Bold', requiredTier: 'enterprise' });
    expect(ent.offeredPlan).toBe('career_pro');
    expect(ent.message).toMatch(/Career Pro includes: All templates\./);
  });

  it('Free credits renew on the account anniversary; Business has nothing above it', () => {
    expect(upgradePrompt('aiCredits', { plan: 'free', canUpgrade: false }).message).toMatch(/account anniversary/);
    expect(upgradePrompt('aiCredits', { plan: 'starter', canUpgrade: false }).message).toMatch(/billing date/);
    const top = upgradePrompt('analyses', { plan: 'business', canUpgrade: true });
    expect(top.offeredPlan).toBeNull();
    expect(top.message).toMatch(/highest self-serve plan/);
  });

  it('a meter outage or an unsold plan is not an upgrade prompt', () => {
    const meter = upgradePrompt('meter', { plan: 'free', canUpgrade: true });
    expect(meter.upgradeable).toBe(false);
    expect(meter.offeredPlan).toBeNull();
    expect(meter.message).toMatch(/nothing ran and nothing was used/);
    expect(upgradePrompt('notOnSale', { plan: 'free', canUpgrade: true }).upgradeable).toBe(false);
  });

  it('uses the minimum plan and the limit the API sent', () => {
    const feature = promptForApiError(apiError(403, { code: 'UPGRADE_REQUIRED', message: 'x', minimumPlan: 'professional' }), {
      plan: 'free',
      canUpgrade: true,
    });
    expect(feature?.offeredPlan).toBe('professional');
    expect(feature?.message).toMatch(/^This needs the Professional plan or above\./);
    const jobs = promptForApiError(apiError(403, { code: 'JOB_CAPACITY_REACHED', message: 'x', limit: 25 }), { plan: 'free', canUpgrade: false });
    expect(jobs?.message).toBe('Your plan tracks up to 25 applications at a time. Archive one you’ve finished with to make room.');
    expect(promptForApiError(apiError(400, { message: 'bad' }), { plan: 'free', canUpgrade: true })).toBeNull();
  });
});
