import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Guards the Privacy Policy's subprocessor list against the code.
 *
 * WHY THIS EXISTS. The policy disclosed **Brevo** as the transactional-email
 * provider long after the product had migrated to **AWS SES**. Nothing caught
 * it: the disclosure lives in six locale JSON files, the provider lives in
 * `package.json` + `mail.service.ts`, and the two had no relationship. An
 * inaccurate subprocessor list is a GDPR Art. 13(1)(e) accuracy problem and, in
 * that case, also under-disclosed a second transfer of personal data to the US.
 *
 * These tests tie the disclosure to reality in both directions:
 *   - every third party we actually ship an SDK for MUST be disclosed, and
 *   - the policy must NOT name a provider we no longer use.
 *
 * If you add or remove a data-processing dependency, update PROVIDERS below and
 * the `privacy.s3_desc` copy in ALL SIX locales together.
 */

const REPO_ROOT = join(__dirname, '..', '..', '..', '..');
const LOCALES = ['en', 'es', 'fr', 'de', 'ar', 'ur'] as const;

function apiDependencies(): Record<string, string> {
  const pkg = JSON.parse(readFileSync(join(REPO_ROOT, 'apps', 'api', 'package.json'), 'utf8'));
  return { ...pkg.dependencies, ...pkg.devDependencies };
}

function disclosure(locale: string): string {
  const file = join(REPO_ROOT, 'apps', 'web', 'public', 'locales', locale, 'common.json');
  const json = JSON.parse(readFileSync(file, 'utf8'));
  return json?.privacy?.s3_desc ?? '';
}

/**
 * npm package that proves we send data to a processor → the name(s) the policy
 * may use for it. The brand name is intentionally matched case-insensitively
 * and is not translated in any locale, so one check covers all six.
 */
const PROVIDERS: { dependency: string; label: string; accept: RegExp }[] = [
  { dependency: 'firebase-admin', label: 'Firebase', accept: /firebase/i },
  { dependency: 'stripe', label: 'Stripe', accept: /stripe/i },
  { dependency: 'openai', label: 'OpenAI', accept: /openai/i },
  { dependency: '@aws-sdk/client-sesv2', label: 'Amazon SES', accept: /amazon|aws|\bses\b/i },
];

/** Processors we have shipped in the past and must NOT still be claiming. */
const RETIRED_PROVIDERS: { label: string; dependency: string; pattern: RegExp }[] = [
  { label: 'Brevo', dependency: '@getbrevo/brevo', pattern: /brevo/i },
  { label: 'SendGrid', dependency: '@sendgrid/mail', pattern: /sendgrid/i },
  { label: 'Mailgun', dependency: 'mailgun.js', pattern: /mailgun/i },
];

describe('Privacy Policy subprocessor disclosure', () => {
  const deps = apiDependencies();

  it('the English disclosure exists and is substantive', () => {
    expect(disclosure('en').length).toBeGreaterThan(100);
  });

  describe('every shipped processor is disclosed', () => {
    for (const { dependency, label, accept } of PROVIDERS) {
      it(`${label} (${dependency})`, () => {
        if (!deps[dependency]) {
          // Not shipped → nothing to disclose. Recorded rather than skipped so
          // removing a dependency shows up in the test output.
          expect(deps[dependency]).toBeUndefined();
          return;
        }
        for (const locale of LOCALES) {
          expect({ locale, matched: accept.test(disclosure(locale)) }).toEqual({
            locale,
            matched: true,
          });
        }
      });
    }
  });

  describe('no retired processor is still claimed', () => {
    for (const { label, dependency, pattern } of RETIRED_PROVIDERS) {
      it(`does not name ${label} unless ${dependency} is actually a dependency`, () => {
        if (deps[dependency]) return; // genuinely in use — disclosure is correct
        for (const locale of LOCALES) {
          expect({ locale, stillNamed: pattern.test(disclosure(locale)) }).toEqual({
            locale,
            stillNamed: false,
          });
        }
      });
    }
  });

  it('discloses the US transfer for both US-hosted processors', () => {
    // OpenAI and Amazon SES both process personal data on US servers. The
    // English copy must say so; the translated copies are checked for the
    // provider names above, and their US-transfer wording is locale-specific.
    const en = disclosure('en');
    expect(en).toMatch(/United States/i);
    // Two separate US-hosted processors ⇒ the phrase should appear twice.
    expect(en.match(/United States/gi)?.length ?? 0).toBeGreaterThanOrEqual(2);
  });
});
