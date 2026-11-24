import { beforeEach, describe, expect, it, vi } from 'vitest';

type Button = { text: string; onPress?: () => void };
const h = vi.hoisted(() => ({
  uid: 'u1' as string | null,
  storage: new Map<string, string>(),
  alert: vi.fn(),
  openBrowser: vi.fn(async () => undefined),
}));
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: async (k: string) => h.storage.get(k) ?? null,
    setItem: async (k: string, v: string) => void h.storage.set(k, v),
    removeItem: async (k: string) => void h.storage.delete(k),
  },
}));
vi.mock('expo-web-browser', () => ({ openBrowserAsync: h.openBrowser }));
vi.mock('react-native', () => ({ Alert: { alert: h.alert } }));
vi.mock('../i18n', () => ({ t: (k: string) => k }));
vi.mock('./firebase', () => ({ getFirebaseAuth: () => ({ currentUser: h.uid ? { uid: h.uid } : null }) }));
vi.mock('./legal-docs', () => ({ legalDocUrl: () => 'https://example.test/privacy' }));

const { ensureAiConsent, hasAiConsent, isCareerAiRequest, isV1AiRequest, setAiConsent } = await import('./ai-consent');
const press = (text: string, call = h.alert.mock.calls.length - 1) =>
  (h.alert.mock.calls[call]![2] as Button[]).find((b) => b.text === text)!.onPress!();
const shown = (n = 1) => vi.waitFor(() => expect(h.alert).toHaveBeenCalledTimes(n));

beforeEach(() => {
  h.uid = 'u1';
  h.storage.clear();
  vi.clearAllMocks();
});

describe('which requests need the AI permission', () => {
  it('covers every V1 AI call', () => {
    for (const url of ['/ai/cv-summary', '/ai/ats-check', '/ai/interview-prep', '/ai/generate-job-description', '/ai/cover-letter', '/ai/regenerate-paragraph', '/ai/linkedin', '/cover-letters/abc/ai/generate']) {
      expect([url, isV1AiRequest('post', url)]).toEqual([url, true]);
    }
    for (const [m, url] of [['get', '/ai/x'], ['post', '/cvs'], ['post', '/auth/verify'], ['post', '/legal/acceptances'], [undefined, undefined]] as const) {
      expect(isV1AiRequest(m, url)).toBe(false);
    }
  });

  it('covers every career AI call and nothing ordinary', () => {
    const base = 'https://api.example.test/api/career/v1';
    for (const p of ['/imports', '/resumes/r1/generate', '/resumes/r1/tailor', '/writing', '/interviews/text', '/interviews/voice/s1/recording', '/interviews/voice/s1/transcription', '/coaching', '/action-packs', '/action-packs/a1/retry', '/learning/skill-reports']) {
      expect([p, isCareerAiRequest('POST', base + p)]).toEqual([p, true]);
    }
    // Comparisons and interview feedback are rules on our own server: no AI provider.
    for (const p of ['/analyses', '/matches', '/interviews/text/s1/answers', '/interviews/text/s1/challenges', '/facts', '/resumes', '/saved-searches', '/interviews/voice', '/interviews/voice/consent', '/account/delete', '/learning/skill-reports/r1/project-brief/evidence', '/session']) {
      expect([p, isCareerAiRequest('POST', base + p)]).toEqual([p, false]);
    }
    expect(isCareerAiRequest('GET', `${base}/coaching`)).toBe(false);
  });
});

describe('ensureAiConsent', () => {
  it('asks, remembers Allow for this account only, and stops asking', async () => {
    const first = ensureAiConsent();
    await shown();
    press('common.aiConsent.allow');
    expect(await first).toBe(true);
    expect(await ensureAiConsent()).toBe(true);
    expect(h.alert).toHaveBeenCalledTimes(1);
    h.uid = 'u2';
    expect(await hasAiConsent()).toBe(false);
  });

  it('refuses on Not now and asks again next time', async () => {
    const first = ensureAiConsent();
    await shown();
    press('common.aiConsent.notNow');
    expect(await first).toBe(false);
    const second = ensureAiConsent();
    await shown(2);
    press('common.aiConsent.notNow');
    expect(await second).toBe(false);
  });

  it('reading the privacy policy is not consent: it asks again', async () => {
    const p = ensureAiConsent();
    await shown();
    press('common.aiConsent.privacy');
    await shown(2);
    expect(h.openBrowser).toHaveBeenCalledWith('https://example.test/privacy');
    press('common.aiConsent.notNow');
    expect(await p).toBe(false);
  });

  it('shares one prompt between parallel calls, and can be withdrawn', async () => {
    const both = Promise.all([ensureAiConsent(), ensureAiConsent()]);
    await shown();
    press('common.aiConsent.allow');
    expect(await both).toEqual([true, true]);
    expect(h.alert).toHaveBeenCalledTimes(1);
    await setAiConsent(false);
    expect(await hasAiConsent()).toBe(false);
  });
});
