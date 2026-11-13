import { AxiosError, AxiosHeaders } from 'axios';
import { describe, expect, it } from 'vitest';
import { setLocale } from '../i18n';
import {
  AI_LANGUAGE,
  aiLanguage,
  aiChargeNote,
  buildDraftRequest,
  buildJobDescriptionRequest,
  buildParagraphRequest,
  draftChargeNote,
  draftToHtml,
  readAiContent,
} from './cover-letter-ai';

function nestError(status: number, body: Record<string, unknown>): AxiosError {
  const headers = new AxiosHeaders();
  return new AxiosError('fail', 'ERR', { headers } as never, null, {
    status,
    statusText: '',
    headers,
    config: { headers } as never,
    data: body,
  });
}

describe('AI request bodies (not called live — shapes match the DTOs)', () => {
  it('job description: GenerateJobDescriptionDto keys only, blank company omitted', () => {
    expect(buildJobDescriptionRequest('  Engineer ', '  ')).toEqual({ jobTitle: 'Engineer', language: AI_LANGUAGE });
    expect(buildJobDescriptionRequest('Engineer', ' Acme ')).toEqual({
      jobTitle: 'Engineer',
      companyName: 'Acme',
      language: 'English',
    });
    expect(buildJobDescriptionRequest('x'.repeat(300), '').jobTitle).toHaveLength(200);
  });

  it('draft: GenerateAiCoverLetterDto keys, trimmed and clamped', () => {
    const body = buildDraftRequest({
      jobTitle: ' Dev ',
      jobDescription: 'd'.repeat(25000),
      companyName: ' Acme ',
      candidateSummary: 's'.repeat(60000),
      tone: 'friendly',
      length: 'short',
    });
    expect(Object.keys(body).sort()).toEqual(
      ['candidateSummary', 'companyName', 'jobDescription', 'jobTitle', 'language', 'length', 'tone'].sort(),
    );
    expect(body.jobTitle).toBe('Dev');
    expect(body.companyName).toBe('Acme');
    expect(body.jobDescription).toHaveLength(20000);
    expect(body.candidateSummary).toHaveLength(50000);
    expect(body.tone).toBe('friendly');
    expect(body.length).toBe('short');
  });

  it('paragraph: RegenerateParagraphDto caps (letter 20000, paragraph 4000)', () => {
    const body = buildParagraphRequest('L'.repeat(21000), 'P'.repeat(5000));
    expect(body.letter).toHaveLength(20000);
    expect(body.paragraph).toHaveLength(4000);
    expect(body.language).toBe('English');
    expect(Object.keys(body).sort()).toEqual(['language', 'letter', 'paragraph']);
  });
});

describe('AI responses', () => {
  it('reads and trims content', () => {
    expect(readAiContent({ content: '  Hello\n\nWorld \n', provider: 'x', creditsUsed: 1 })).toBe('Hello\n\nWorld');
  });

  it('throws on an empty or missing content', () => {
    expect(() => readAiContent({ content: '   ' })).toThrow();
    expect(() => readAiContent({})).toThrow();
    expect(() => readAiContent(null)).toThrow();
  });

  it('draftToHtml always escapes, like the web create page', () => {
    expect(draftToHtml('Hi <b>there</b>\n\nLine1\nLine2')).toBe('<p>Hi &lt;b&gt;there&lt;/b&gt;</p><p>Line1<br>Line2</p>');
    expect(draftToHtml('<p>x</p>')).toBe('<p>&lt;p&gt;x&lt;/p&gt;</p>');
  });

  it('charge notes follow AI_CREDIT_NOT_REFUNDED', () => {
    const unconfirmed = nestError(502, { message: 'Provider failed', code: 'AI_CREDIT_NOT_REFUNDED' });
    const refunded = nestError(502, { message: 'Provider failed' });
    expect(aiChargeNote(unconfirmed)).toMatch(/may have been used/);
    expect(aiChargeNote(refunded)).toMatch(/No Engine credit was used/);
    expect(draftChargeNote(unconfirmed)).toMatch(/No draft was saved, but/);
    expect(draftChargeNote(refunded)).toMatch(/no draft was saved/);
  });
});

describe('aiLanguage', () => {
  it('asks for the app language by its English name, like the website', () => {
    expect(aiLanguage()).toBe(AI_LANGUAGE);
    setLocale('fr');
    expect(aiLanguage()).toBe('French');
    expect(buildJobDescriptionRequest('Engineer', '').language).toBe('French');
    setLocale('ur');
    expect(aiLanguage()).toBe('Urdu');
    setLocale('en');
  });
});
