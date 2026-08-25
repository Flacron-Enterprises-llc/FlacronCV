/**
 * English-only unique body for /en/templates (`locale === 'en'`).
 *
 * The gallery, hero chrome, and CTA stay in `t('public_templates')` for all
 * six locales. These strings are not a `t()` namespace, so the six-locale
 * gates never see them. Do not move them into common.json unless the extra
 * sections are being translated. Not `englishDocument` — `/templates` keeps
 * its full hreflang cluster. Not a new path.
 */
export const PUBLIC_TEMPLATES_EN = {
  mid_title: 'What you get in every template',
  mid_subtitle: 'The layout is done. Your job is the words.',
  mid1_title: 'Structure that reads cleanly',
  mid1_desc:
    'Standard section headings and clear text, so applicant tracking systems can extract your details rather than losing them in a layout. How any individual system interprets a CV is outside our control.',
  mid2_title: 'Every line is editable',
  mid2_desc:
    'Nothing is locked. Change the wording, reorder sections, remove what does not apply to you. The template is a starting point, not a form.',
  mid3_title: 'CVs and cover letters together',
  mid3_desc:
    'Both live in the same gallery, so a letter can match the CV you send with it rather than looking like it came from somewhere else.',
  close_title: 'From template to document you can send',
  close_subtitle: 'Three steps, and your work saves as you go.',
  close1_title: 'Pick a template',
  close1_desc:
    'Browse the gallery and preview any of them. You can change your mind later without starting over.',
  close2_title: 'Fill it in',
  close2_desc:
    'Write it yourself, or let AI draft the sections you find hardest. Both work, and you can mix them.',
  close3_title: 'Export and send',
  close3_desc:
    'Download as PDF or Word. Check that names, dates and employment history are accurate before it goes to an employer.',
  related_title: 'Prefer to start with AI?',
  related_cv_cta: 'Build your CV with AI',
  related_letter_cta: 'Generate a cover letter',
} as const;
