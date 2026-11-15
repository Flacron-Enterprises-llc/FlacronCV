import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../../../packages/career-api-client/src/client';
import {
  CAREER_AREAS,
  careerAccessState,
  careerErrorMessage,
  describeAccess,
  documentCredits,
  visibleAreas,
  type CareerSubscriptionView,
} from './career-view';

const writes: string[] = [];
const deletes: string[] = [];
let shareFails = false;
vi.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'file:///cache/',
  EncodingType: { Base64: 'base64', UTF8: 'utf8' },
  writeAsStringAsync: async (uri: string) => {
    writes.push(uri);
  },
  deleteAsync: async (uri: string) => {
    deletes.push(uri);
  },
}));
vi.mock('expo-sharing', () => ({
  isAvailableAsync: async () => true,
  shareAsync: async () => {
    if (shareFails) throw new Error('dismissed');
  },
}));

const base = { enabled: true, loading: false, error: null, subscription: null };
const purchased: CareerSubscriptionView = {
  plan: 'professional',
  interval: 'month',
  status: 'active',
  currentPeriodEnd: '2026-12-02T00:00:00.000Z',
  cancelAtPeriodEnd: false,
  source: 'stripe',
};

describe('careerAccessState', () => {
  it('is off when the build has career disabled, whatever the server says', () => {
    expect(careerAccessState({ ...base, enabled: false, access: { enabled: true, v1Plan: 'pro', features: {} } }).kind).toBe('off');
  });

  it('treats an unreachable service as offline, never as access', () => {
    const state = careerAccessState({ ...base, access: undefined, error: new ApiError(0, 'network_error', { code: 'network_error' }) });
    expect(state.kind).toBe('offline');
    expect(careerAccessState({ ...base, access: undefined, error: new ApiError(500, 'internal_error', { code: 'internal_error' }) }).kind).toBe('unavailable');
  });

  it('existing V1 plan without the add-on: not included, and the V1 plan is described as unchanged', () => {
    const state = careerAccessState({ ...base, access: { enabled: false, v1Plan: 'pro', reason: 'plan_not_mapped', features: {} } });
    expect(state.kind).toBe('not_included');
    const copy = describeAccess(state);
    expect(copy.body).toMatch(/optional add-on/);
    expect(copy.body).toMatch(/stay exactly as they are/);
  });

  it('purchased add-on: separate from the V1 plan, cancellation affects only career, renewal date shown', () => {
    const state = careerAccessState({
      ...base,
      access: { enabled: true, v1Plan: 'pro', careerPlan: 'professional', source: 'purchase', features: {} },
      subscription: purchased,
    });
    expect(state).toMatchObject({ kind: 'active', planName: 'Professional', origin: 'purchase' });
    const copy = describeAccess(state);
    expect(copy.title).toBe('Career Professional');
    expect(copy.body).toMatch(/Cancelling it ends only the career tools; your FlacronCV plan continues/);
    expect(copy.body).toMatch(/Renews on December 2, 2026/);
  });

  it('a local fixture is labelled as a test entitlement, not a purchase', () => {
    const state = careerAccessState({
      ...base,
      access: { enabled: true, v1Plan: 'pro', careerPlan: 'professional', source: 'purchase', features: {} },
      subscription: { ...purchased, source: 'local_fixture' },
    });
    const copy = describeAccess(state);
    expect(copy.badge).toBe('TEST ENTITLEMENT');
    expect(copy.body).toMatch(/not a purchase/);
  });

  it('past due and ending states are explained', () => {
    const state = careerAccessState({
      ...base,
      access: { enabled: true, v1Plan: 'pro', careerPlan: 'starter', source: 'purchase', features: {} },
      subscription: { ...purchased, plan: 'starter', status: 'past_due', cancelAtPeriodEnd: true },
    });
    const copy = describeAccess(state);
    expect(copy.body).toMatch(/payment for the add-on failed/);
    expect(copy.body).toMatch(/Ends on/);
    expect(copy.badge).toBe('ENDING');
  });

  it('never shows a price or a purchase call to action in any state (store rules)', () => {
    const states = [
      careerAccessState({ ...base, access: { enabled: false, v1Plan: 'free', reason: 'plan_not_mapped', features: {} } }),
      careerAccessState({ ...base, access: { enabled: true, v1Plan: 'pro', careerPlan: 'professional', source: 'purchase', features: {} }, subscription: purchased }),
      careerAccessState({ ...base, enabled: false, access: undefined }),
    ];
    for (const state of states) {
      const { title, body } = describeAccess(state);
      expect(`${title} ${body}`).not.toMatch(/\$|USD|buy|purchase on|subscribe|upgrade now|http/i);
    }
  });
});

describe('documentCredits', () => {
  it('uses the server usage when present', () => {
    expect(
      documentCredits(
        { renewalDate: '2026-12-01', units: [{ unit: 'document_credit', includedGranted: 60, includedRemaining: 57, packRemaining: 0, packHeld: 0 }], packs: [] },
        'professional',
      ),
    ).toEqual({ remaining: 57, granted: 60, packs: 0 });
  });

  it('falls back to the catalog allowance for the plan (Professional = 60)', () => {
    expect(documentCredits(undefined, 'professional')).toEqual({ remaining: 60, granted: 60, packs: 0 });
    expect(documentCredits(undefined, null)).toBeNull();
  });
});

describe('visibleAreas', () => {
  it('leaves out areas whose operator switch is off', () => {
    const keys = visibleAreas({ evidenceItems: false, portfolioPages: true }).map((a) => a.key);
    expect(keys).toContain('portfolios');
    expect(keys).not.toContain('evidence');
    expect(keys).toContain('profile');
  });

  it('lists forms, business and developer with in-app screens that state their own availability', () => {
    const areas = visibleAreas({});
    expect(areas.find((a) => a.key === 'forms')?.route).toBe('/(dashboard)/career/forms');
    expect(areas.find((a) => a.key === 'business')?.route).toBe('/(dashboard)/career/business');
    expect(areas.find((a) => a.key === 'developer')?.route).toBe('/(dashboard)/career/developer');
  });

  it('points every in-app area at a screen file that exists', () => {
    const appDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'app');
    const exists = (route: string) =>
      [`${route}.tsx`, `${route}/index.tsx`].some((candidate) => fs.existsSync(path.join(appDir, candidate)));
    const inApp = CAREER_AREAS.filter((area) => area.where === 'app');
    expect(inApp.length).toBeGreaterThan(15);
    for (const area of inApp) {
      expect(area.route, area.key).toBeTruthy();
      expect(exists(area.route as string), `${area.key} → ${area.route}`).toBe(true);
    }
    expect(new Set(CAREER_AREAS.map((area) => area.key)).size).toBe(CAREER_AREAS.length);
  });
});

describe('careerErrorMessage', () => {
  it('never claims a failed write was saved', () => {
    expect(careerErrorMessage(new ApiError(0, 'network_error', { code: 'network_error' }), 'x')).toMatch(/Nothing was saved/);
    expect(careerErrorMessage(new ApiError(409, 'revision_conflict', { code: 'revision_conflict' }), 'x')).toMatch(/was not saved/);
    expect(careerErrorMessage(new ApiError(402, 'quota_exhausted', { code: 'quota_exhausted' }), 'x')).toMatch(/credits/);
    expect(careerErrorMessage({ isAxiosError: true }, 'x')).toMatch(/No connection/);
    expect(careerErrorMessage(new Error('boom'), 'Could not save.')).toBe('Could not save.');
  });
});

describe('career file sharing', () => {
  it('names files safely and encodes bytes like Buffer would', async () => {
    const { safeFileName, bytesToBase64 } = await import('./career-files');
    expect(safeFileName('Élodie — CV / 2026', 'pdf')).toBe('Elodie-CV-2026.pdf');
    expect(safeFileName('   ', 'docx')).toBe('career-document.docx');
    for (const text of ['', 'a', 'ab', 'abc', 'abcd', 'héllo wörld']) {
      const bytes = new TextEncoder().encode(text);
      expect(bytesToBase64(bytes)).toBe(Buffer.from(bytes).toString('base64'));
    }
  });

  it('removes the temporary copy after sharing, even when sharing fails', async () => {
    const { shareCareerFile } = await import('./career-files');
    const file = { contentType: 'application/pdf', bytes: new Uint8Array([37, 80, 68, 70]) };
    await shareCareerFile(file, 'My CV', 'pdf');
    shareFails = true;
    await expect(shareCareerFile(file, 'My CV', 'pdf')).rejects.toThrow('dismissed');
    expect(writes).toHaveLength(2);
    expect(deletes).toEqual(writes);
  });
});

describe('factSummary', () => {
  it('uses the catalog field order and skips empty fields', async () => {
    const { factSummary } = await import('./career-view');
    expect(factSummary('experience', { company: 'Acme', position: 'Analyst', location: '', startDate: '2021-03' })).toEqual({
      title: 'Analyst',
      detail: 'Acme · 2021-03',
    });
    expect(factSummary('skill', {}).title).toBe('Skill');
  });
});

describe('data export sharing', () => {
  it('removes the temporary export file after sharing', async () => {
    const { shareTextFile } = await import('./career-files');
    shareFails = false;
    writes.length = 0;
    deletes.length = 0;
    await shareTextFile('{"a":1}', 'flacroncv-data.json', 'application/json');
    expect(writes).toEqual(['file:///cache/flacroncv-data.json']);
    expect(deletes).toEqual(writes);
  });
});
