import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SUPPORTED_LOCALES } from './config';
import { messageArguments } from './format';
import { MESSAGES } from './messages';

/**
 * Gates for the message files in ./locales/<locale>/<namespace>.json.
 *
 * A failure names the locale, namespace and key. Fix the translation file —
 * never weaken a check or change `en` to make another locale pass.
 */

const LOCALES_DIR = join(__dirname, 'locales');
const NON_EN = SUPPORTED_LOCALES.filter((l) => l !== 'en');

/**
 * Values allowed to be identical to English. Key = `namespace.path` (all
 * locales) or `locale:namespace.path` (that locale only). Every entry needs a
 * reason a native reader would accept: a brand, a product/plan name, a word the
 * language really spells the same way.
 */
const SAME_AS_ENGLISH: Record<string, string> = {
  // Brands.
  'settings.profile.linkedin': 'brand',
  'settings.profile.github': 'brand',
  // Plan names are not localised in es/fr/de (website: common.pro / common.enterprise).
  'es:settings.plans.pro': 'plan name',
  'fr:settings.plans.pro': 'plan name',
  'de:settings.plans.pro': 'plan name',
  'es:settings.plans.enterprise': 'plan name',
  'fr:settings.plans.enterprise': 'plan name',
  'de:settings.plans.enterprise': 'plan name',
  // Words spelled the same in the target language.
  'fr:common.ok': 'French uses "OK" on buttons',
  'de:common.ok': 'German uses "OK" on buttons',
  'de:tabs.dashboard': 'German UI word (website dashboard.title)',
  'fr:settings.notifications.title': 'same word in French',
  'es:settings.billing.plan': 'same word in Spanish (website billing.plan)',
  'es:settings.billing.usage.cvs': 'Spanish uses "CVs" (website dashboard.my_cvs)',
  'de:settings.billing.status': 'same word in German',
  'de:settings.usage.credits': 'German UI uses "Credits"',
  'de:settings.billing.usage.credits': 'German UI uses "Credits"',
  // Jobs / support: same words as the website (jobs.* / support.*).
  'fr:jobs.form.notes': 'same word in French (website jobs.notes)',
  'de:jobs.sort.position': 'same word in German (website jobs.sort.position)',
  'de:jobs.sort.status': 'same word in German (website jobs.sort.status)',
  'de:jobs.form.status': 'same word in German (website jobs.status_label)',
  'de:jobs.card.interview': 'same word in German (website jobs.interview_on)',
  'es:support.categories.general': 'same word in Spanish (website support.categoryLabels.general)',
  'es:support.form.categories.general': 'same word in Spanish (website support.categoryLabels.general)',
  'fr:support.title': 'same word in French (website support.title)',
  'de:support.title': 'same word in German (website support.title)',
  'fr:support.form.description': 'same word in French',
  // Cover letters: same as the website (coverLetters.status_final / tpl_* / cover_letter.tones.formal).
  'es:coverLetters.status.final': 'same word in Spanish (website coverLetters.status_final)',
  'es:coverLetters.tones.formal': 'same word in Spanish (website cover_letter.tones.formal)',
  'fr:coverLetters.templates.corporate.name': 'template name (website coverLetters.tpl_corporate)',
  'de:coverLetters.templates.modern.name': 'same word in German (website coverLetters.tpl_modern)',
  'de:coverLetters.templates.corporate.name': 'template name (website coverLetters.tpl_corporate)',
  'de:coverLetters.templates.executive.name': 'template name (website coverLetters.tpl_executive)',
  // cvEditor: same words as the website (cv_builder.certifications / field_description / level_expert / field_website).
  'fr:cvEditor.wizard.steps.certifications': 'same word in French (website cv_builder.certifications)',
  'fr:cvEditor.sectionTypes.certifications': 'same word in French (website cv_builder.certifications)',
  'fr:cvEditor.certifications.title': 'same word in French (website cv_builder.certifications)',
  'fr:cvEditor.sectionTypes.publications': 'same word in French',
  'fr:cvEditor.fields.description': 'same word in French (website cv_builder.field_description)',
  'fr:cvEditor.custom.descriptionPlaceholder': 'same word in French (website cv_builder.ph_generic_desc)',
  'fr:cvEditor.custom.date': 'same word in French',
  'fr:cvEditor.skills.levels.expert': 'same word in French (website cv_builder.level_expert)',
  'de:cvEditor.fields.website': 'German UI word (website cv_builder.field_website)',
  // aiTools / exports
  'fr:aiTools.ats.suggestions': 'same word in French',
  // templates / cvDesign: values copied from the website (templates.pro/enterprise, template_picker.*).
  'es:templates.tiers.pro': 'plan name (website templates.pro)',
  'fr:templates.tiers.pro': 'plan name (website templates.pro)',
  'de:templates.tiers.pro': 'plan name (website templates.pro)',
  'es:templates.tiers.enterprise': 'plan name (website templates.enterprise)',
  'fr:templates.tiers.enterprise': 'plan name (website templates.enterprise)',
  'de:templates.tiers.enterprise': 'plan name (website templates.enterprise)',
  'de:templates.preview.layout': 'German UI word (website template_picker.layout_heading)',
  'de:cvDesign.sections.layout': 'German UI word (website template_picker.layout_heading)',
  'cvDesign.layouts.slateGold': 'layout name kept in every language (website template_picker.layout_slate_gold)',
  'fr:cvDesign.layouts.compact': 'same word in French (website template_picker.layout_compact)',
  'es:cvDesign.colors.zinc': 'colour name, same in Spanish (website template_picker.color_zinc)',
  'fr:cvDesign.colors.indigo': 'same word in French (website template_picker.color_indigo)',
  'fr:cvDesign.colors.cyan': 'same word in French (website template_picker.color_cyan)',
  'fr:cvDesign.colors.rose': 'same word in French (website template_picker.color_rose)',
  'fr:cvDesign.colors.orange': 'same word in French (website template_picker.color_orange)',
  'fr:cvDesign.colors.violet': 'same word in French (website template_picker.color_violet)',
  'fr:cvDesign.colors.zinc': 'same word in French (website template_picker.color_zinc)',
  'de:cvDesign.colors.indigo': 'same word in German (website template_picker.color_indigo)',
  'de:cvDesign.colors.cyan': 'same word in German (website template_picker.color_cyan)',
  'de:cvDesign.colors.orange': 'same word in German (website template_picker.color_orange)',
  'fr:cvDesign.sectionStyles.card': 'same word in French (website template_picker.section_style_badge)',
  'de:cvDesign.sectionStyles.card': 'same word in German (website template_picker.section_style_badge)',
  'fr:cvDesign.sectionStyles.minimal': 'same word in French (website template_picker.section_style_minimal)',
  'de:cvDesign.sectionStyles.minimal': 'same word in German (website template_picker.section_style_minimal)',
  // Career profile / drafts / alerts: values copied from the website (career.profile.*, career.resume.templates.*, career.alerts.*).
  'careerProfile.fields.linkedin': 'brand (website career.profile.fields.linkedin)',
  'careerProfile.fields.github': 'brand (website career.profile.fields.github)',
  'fr:careerProfile.fields.description': 'same word in French (website career.profile.fields.description)',
  'fr:careerProfile.fields.technologies': 'same word in French (website career.profile.fields.technologies)',
  'fr:careerProfile.fields.date': 'same word in French (website career.profile.fields.date)',
  'fr:careerProfile.seniority.senior': 'same word in French (website career.profile.seniority_senior)',
  'de:careerProfile.fields.text': 'same word in German (website career.profile.fields.text)',
  'de:careerProfile.fields.position': 'same word in German (website career.profile.fields.position)',
  'de:careerProfile.fields.details': 'same word in German (website career.profile.fields.details)',
  'de:careerProfile.fields.name': 'same word in German (website career.profile.fields.name)',
  'de:careerProfile.fields.url': 'same word in German (website career.profile.fields.url)',
  'de:careerProfile.arrangement.hybrid': 'same word in German (website career.profile.arrangement_hybrid)',
  'de:careerProfile.arrangement.remote': 'German UI word (website career.profile.arrangement_remote)',
  'de:careerProfile.seniority.senior': 'same word in German (website career.profile.seniority_senior)',
  'es:careerDocuments.templates.resume.editorial': 'same word in Spanish (website career.resume.templates.editorial)',
  'fr:careerDocuments.templates.resume.minimal': 'same word in French (website career.resume.templates.minimal)',
  'fr:careerDocuments.templates.resume.compact': 'same word in French (website career.resume.templates.compact)',
  'de:careerDocuments.templates.resume.modern': 'same word in German (website career.resume.templates.modern)',
  'de:careerDocuments.templates.resume.minimal': 'same word in German (website career.resume.templates.minimal)',
  'de:careerDocuments.templates.resume.slateGold': 'layout name (website career.resume.templates.slate-gold)',
  'fr:careerDocuments.resume.versions': 'same word in French (website career.resume.versions)',
  'fr:careerDocuments.resume.version': 'same word in French (website career.resume.version_label)',
  'fr:careerDocuments.resume.versionLanguage': 'same words in French (website career.resume.version_label)',
  'es:careerAlerts.settings.telegram': 'brand',
  'fr:careerAlerts.settings.telegram': 'brand',
  'de:careerAlerts.settings.telegram': 'brand',
  'fr:careerAlerts.settings.push': 'same word in French (website career.alerts.push)',
  'de:careerAlerts.settings.push': 'same word in German (website career.alerts.push)',
  // careerEvidence
  'fr:careerEvidence.types.publication': 'same word in French (website career.evidence.type_publication)',
  'fr:careerEvidence.form.description': 'same word in French (website career.evidence.field_description)',
  // careerInterviews
  'es:careerInterviews.stages.panel': 'same word in Spanish (website career.interviews.stage_panel)',
  'fr:careerInterviews.stages.panel': 'same word in French (website career.interviews.stage_panel)',
  'fr:careerInterviews.story.fields.situation': 'same word in French (website career.interviews.situation)',
  'fr:careerInterviews.story.fields.action': 'same word in French (website career.interviews.action)',
  'de:careerInterviews.stages.recruiter': 'German UI word (website career.interviews.stage_recruiter)',
  'de:careerInterviews.story.fields.situation': 'same word in German (website career.interviews.situation)',
};

type Tree = Record<string, unknown>;

function flatten(value: unknown, prefix: string, out: Record<string, string> = {}): Record<string, string> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const [k, v] of Object.entries(value as Tree)) flatten(v, `${prefix}.${k}`, out);
  } else {
    out[prefix] = value as string;
  }
  return out;
}

function readNamespace(locale: string, ns: string): Record<string, string> {
  return flatten(JSON.parse(readFileSync(join(LOCALES_DIR, locale, `${ns}.json`), 'utf8')), ns);
}

const namespacesOnDisk = (locale: string) =>
  readdirSync(join(LOCALES_DIR, locale))
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.slice(0, -5))
    .sort();

const NAMESPACES = namespacesOnDisk('en');

describe('message files', () => {
  it('every locale folder has exactly the en namespaces', () => {
    for (const locale of SUPPORTED_LOCALES) {
      expect(`${locale}: ${namespacesOnDisk(locale).join(',')}`).toBe(`${locale}: ${NAMESPACES.join(',')}`);
    }
  });

  it('messages.ts imports every file on disk (run `npm run i18n:index` if not)', () => {
    for (const locale of SUPPORTED_LOCALES) {
      expect(Object.keys(MESSAGES[locale]).sort()).toEqual(NAMESPACES);
      for (const ns of NAMESPACES) {
        expect((MESSAGES[locale] as Tree)[ns]).toEqual(
          JSON.parse(readFileSync(join(LOCALES_DIR, locale, `${ns}.json`), 'utf8')),
        );
      }
    }
  });

  it('namespace names are camelCase file names', () => {
    for (const ns of NAMESPACES) expect(ns).toMatch(/^[a-z][a-zA-Z0-9]*$/);
  });

  it.each(NAMESPACES)('%s: every value is a non-empty string', (ns) => {
    const bad: string[] = [];
    for (const locale of SUPPORTED_LOCALES) {
      for (const [key, value] of Object.entries(readNamespace(locale, ns))) {
        if (typeof value !== 'string' || value.trim() === '') bad.push(`${locale}:${key}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it.each(NAMESPACES)('%s: every locale has exactly the en keys', (ns) => {
    const en = Object.keys(readNamespace('en', ns)).sort();
    for (const locale of NON_EN) {
      const keys = Object.keys(readNamespace(locale, ns)).sort();
      const missing = en.filter((k) => !keys.includes(k)).map((k) => `${locale} missing ${k}`);
      const extra = keys.filter((k) => !en.includes(k)).map((k) => `${locale} extra ${k}`);
      expect([...missing, ...extra]).toEqual([]);
    }
  });

  it.each(NAMESPACES)('%s: placeholders and plural arguments match en', (ns) => {
    const en = readNamespace('en', ns);
    const problems: string[] = [];
    for (const locale of NON_EN) {
      const target = readNamespace(locale, ns);
      for (const [key, value] of Object.entries(en)) {
        if (typeof target[key] !== 'string') continue;
        const want = messageArguments(value).join(' ');
        const got = messageArguments(target[key]).join(' ');
        if (want !== got) problems.push(`${locale}:${key} has [${got}], en has [${want}]`);
      }
    }
    expect(problems).toEqual([]);
  });

  it.each(NAMESPACES)('%s: no non-en value is left in English', (ns) => {
    const en = readNamespace('en', ns);
    const untranslated: string[] = [];
    for (const locale of NON_EN) {
      const target = readNamespace(locale, ns);
      for (const [key, value] of Object.entries(en)) {
        if (target[key] !== value) continue;
        if (key in SAME_AS_ENGLISH || `${locale}:${key}` in SAME_AS_ENGLISH) continue;
        untranslated.push(`${locale}:${key} = ${JSON.stringify(value)}`);
      }
    }
    expect(untranslated).toEqual([]);
  });

  it('the allow-list has no stale entries', () => {
    const stale = Object.keys(SAME_AS_ENGLISH).filter((entry) => {
      const [locale, key] = entry.includes(':') ? entry.split(':') : [null, entry];
      const ns = key.split('.')[0];
      if (!NAMESPACES.includes(ns)) return true;
      const en = readNamespace('en', ns)[key];
      if (en === undefined) return true;
      const locales = locale ? [locale] : NON_EN;
      return !locales.some((l) => readNamespace(l, ns)[key] === en);
    });
    expect(stale).toEqual([]);
  });
});
