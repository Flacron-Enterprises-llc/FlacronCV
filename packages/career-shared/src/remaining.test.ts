import { describe, expect, it } from 'vitest';
import {
  applyReviewedFormFill,
  compareScenarios,
  credentialIsDue,
  formFillPayload,
  formReviewResult,
  isSupportedFormSite,
  learningLoopReport,
  mapSessionView,
  REQUIRED_ATTRIBUTION,
  BUSINESS_SCOPES,
  apiKeyEnvironmentOf,
  apiKeyPrefix,
  credentialReminders,
  isCalendarDate,
  salesInquiryInput,
  transcriptionRequest,
  TRANSCRIPTION_MAX_BYTES,
} from './remaining';

describe('remaining product rules', () => {
  it('keeps a missing wage unknown and refuses a fourth scenario option', () => {
    const compared = compareScenarios([
      { name: 'Stay', costCents: 0, months: 12, destination: 'London', wageCents: null, source: 'user' },
      { name: 'Bridge', costCents: 200000, months: 18, destination: 'Berlin', wageCents: 8000000, source: 'user' },
      { name: 'Train', costCents: null, months: null, destination: 'Remote', wageCents: null, source: 'estimate' },
    ]);
    expect(compared?.options[0].wageLabel).toBe('unknown');
    expect(compared?.options[0].wageCents).toBeNull();
    expect(compared?.options[2].wageCents).toBeNull();
    expect(compared?.tradeoff).toContain('not a promise of earnings or employment');
    expect(compared?.tradeoff).not.toMatch(/guaranteed|hiring probability/i);
    expect(compareScenarios([{ name: 'A', costCents: 0, months: 1, destination: 'X', wageCents: null, source: 'user' }, { name: 'B', costCents: 0, months: 1, destination: 'Y', wageCents: null, source: 'user' }, { name: 'C', costCents: 0, months: 1, destination: 'Z', wageCents: null, source: 'user' }, { name: 'D', costCents: 0, months: 1, destination: 'Q', wageCents: null, source: 'user' }])).toBeNull();
  });

  it('states 2 interviews from 10 recorded applications as 20 percent in that sample', () => {
    const rows = [
      ...Array.from({ length: 8 }, () => ({ status: 'applied' as const })),
      { status: 'interviewing' as const },
      { status: 'offered' as const },
      { status: 'saved' as const },
    ];
    const report = learningLoopReport(rows, 'breakdowns');
    expect(report.sampleSize).toBe(11);
    expect(report.recordedApplications).toBe(10);
    expect(report.unrecorded).toBe(1);
    expect(report.noResponse).toBe(8);
    expect(report.interviews).toBe(2);
    expect(report.statement).toBe('2 interviews from 10 recorded applications is a 20 percent observed interview rate in that sample, not a future hiring probability.');
    expect(learningLoopReport(rows, 'trends').suggestion).toContain('not a hiring probability');
    expect(learningLoopReport(rows, 'basic_counts').interviewRatePercent).toBeNull();
  });

  it('does not send a form, marks credentials due, and keeps map tiles off', () => {
    expect(isSupportedFormSite('example-jobs.test')).toBe(true);
    expect(isSupportedFormSite('other.test')).toBe(false);
    expect(formReviewResult(false)).toBeNull();
    expect(formReviewResult(true)).toEqual({ externalSubmitted: false, message: 'FlacronCV does not send this form.' });
    expect(formFillPayload({ site: 'example-jobs.test', reviewed: false })).toBeNull();
    expect(formFillPayload({ site: 'other.test', reviewed: true })).toBeNull();
    expect(formFillPayload({ site: 'example-jobs.test', reviewed: true, fields: { full_name: 'Ada', extra: 'no' } })).toEqual({
      site: 'example-jobs.test',
      submit: false,
      extension: 'unpacked_local',
      distribution: 'unpublished',
      fields: { full_name: 'Ada', email: '', phone: '', notes: '' },
      message:
        'A local unpacked Chrome extension can fill this site after you start it. FlacronCV does not send the form. Other sites and a store listing are not published.',
    });
    expect(credentialIsDue('2026-11-01', '2026-10-18')).toBe(true);
    expect(credentialIsDue('2027-05-01', '2026-10-18')).toBe(false);
    expect(mapSessionView()).toEqual({
      minutes: 15,
      approximate: true,
      tiles: null,
      coordinates: null,
      attribution: null,
      provider: null,
    });
    expect(REQUIRED_ATTRIBUTION).toContain('FlacronCV');
  });

  it('accepts English and French transcription metadata and refuses invented audio types', () => {
    expect(transcriptionRequest({ language: 'en' })).toEqual({ language: 'en', mimeType: null, byteLength: 0 });
    expect(transcriptionRequest({ language: 'FR', mimeType: 'audio/webm', byteLength: 1024 })).toEqual({
      language: 'fr',
      mimeType: 'audio/webm',
      byteLength: 1024,
    });
    expect(transcriptionRequest({ language: 'de' })).toBeNull();
    // Ogg/Opus (Firefox, Android) is accepted; a non-audio type is not.
    expect(transcriptionRequest({ language: 'en', mimeType: 'audio/ogg' })).toMatchObject({ mimeType: 'audio/ogg' });
    expect(transcriptionRequest({ language: 'en', mimeType: 'video/mp4' })).toBeNull();
    expect(transcriptionRequest({ language: 'en', byteLength: TRANSCRIPTION_MAX_BYTES + 1 })).toBeNull();
  });

  it('fills named example-jobs.test fields and never submits', () => {
    const full_name = { value: '', type: 'text' };
    const email = { value: '', type: 'email' };
    const submit = { type: 'submit', click: () => {
      throw new Error('submitted');
    } };
    const payload = formFillPayload({ site: 'example-jobs.test', reviewed: true, fields: { full_name: 'Ada', email: 'ada@example.test' } });
    expect(payload).not.toBeNull();
    const result = applyReviewedFormFill(
      {
        querySelector: (selector) => {
          if (selector === '[name="full_name"]') return full_name;
          if (selector === '[name="email"]') return email;
          return null;
        },
        querySelectorAll: () => [submit],
      },
      payload!,
    );
    expect(result).toEqual({ filled: ['full_name', 'email'], submit: false });
    expect(full_name.value).toBe('Ada');
    expect(email.value).toBe('ada@example.test');
    expect(salesInquiryInput({ name: 'A', email: 'bad', organization: 'X', message: 'short' })).toBeNull();
    expect(salesInquiryInput({ name: 'Ada Lovelace', email: 'ada@example.test', organization: 'School', message: 'We need SSO for a workforce program.' })).toMatchObject({
      email: 'ada@example.test',
    });
  });

  it('labels each wage by its source and refuses market data without a named, dated source', () => {
    const base = { costCents: 0, months: 6, destination: 'Berlin' };
    const compared = compareScenarios([
      { ...base, name: 'Typed', wageCents: 5000000, source: 'user' },
      { ...base, name: 'Market', wageCents: 6000000, source: 'market', sourceName: 'Federal statistics office', sourceDate: '2026-06-30', uncertainty: 'medium' },
      { ...base, name: 'Guess', wageCents: 7000000, source: 'estimate', uncertainty: 'high' },
    ]);
    expect(compared?.options.map((o) => o.wageLabel)).toEqual(['user_supplied', 'market_data', 'estimate']);
    expect(compared?.options[1]).toMatchObject({ sourceName: 'Federal statistics office', sourceDate: '2026-06-30', uncertainty: 'medium' });
    expect(compared?.options[0].uncertainty).toBe('unknown');
    expect(compareScenarios([{ ...base, name: 'Market', wageCents: 1, source: 'market' }])).toBeNull();
    expect(compareScenarios([{ ...base, name: 'Market', wageCents: 1, source: 'market', sourceName: 'X', sourceDate: '2026-02-31' }])).toBeNull();
    expect(compareScenarios([{ ...base, name: 'Bad', wageCents: 1, source: 'magic' as never }])).toBeNull();
  });

  it('accepts only real calendar dates', () => {
    expect(isCalendarDate('2026-02-28')).toBe(true);
    expect(isCalendarDate('2028-02-29')).toBe(true);
    expect(isCalendarDate('2026-02-31')).toBe(false);
    expect(isCalendarDate('2026-02-29')).toBe(false);
    expect(isCalendarDate('2026-2-1')).toBe(false);
    expect(isCalendarDate(20260101)).toBe(false);
  });

  it('lists credential reminders within 90 days, soonest first, including expired ones', () => {
    const reminders = credentialReminders(
      [
        { id: 'a', name: 'Gas Safe', issuer: 'Gas Safe Register', region: 'UK', expiresOn: '2027-01-10', reviewOn: '2026-12-01' },
        { id: 'b', name: 'First aid', issuer: '', region: '', expiresOn: '2026-11-01', reviewOn: null },
        { id: 'c', name: 'Far away', issuer: '', region: '', expiresOn: '2028-01-01', reviewOn: null },
      ],
      '2026-11-14',
    );
    expect(reminders.map((r) => [r.credentialId, r.kind, r.daysLeft, r.expired])).toEqual([
      ['b', 'expiry', -13, true],
      ['a', 'review', 17, false],
      ['a', 'expiry', 57, false],
    ]);
  });

  it('separates billing from candidate documents and labels key environments', () => {
    expect(BUSINESS_SCOPES.billing_admin).toMatchObject({ candidates: 'none', billing: true, manageWorkspace: false });
    expect(BUSINESS_SCOPES.counselor).toMatchObject({ candidates: 'assigned', billing: false });
    expect(BUSINESS_SCOPES.manager.billing).toBe(false);
    expect(apiKeyPrefix('test')).toBe('flc_test_');
    expect(apiKeyEnvironmentOf('flc_live_abc')).toBe('live');
    expect(apiKeyEnvironmentOf('flc_abc')).toBeNull();
  });
});
