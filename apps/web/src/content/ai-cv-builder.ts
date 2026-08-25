/**
 * English-only landing copy for /en/ai-cv-builder.
 *
 * Same mechanism as the legal pages (`englishDocument: true`, sitemap
 * ENGLISH_DOCUMENT_PATHS): the body is not a `t()` namespace, so the six-locale
 * gates never see it. Do not move these strings into common.json unless the
 * page is being translated. Do not render them through LegalDocumentView.
 */
export const AI_CV_BUILDER_PATH = '/ai-cv-builder';

export const AI_CV_BUILDER = {
  title: 'AI CV Builder — Draft Your CV with AI in Minutes',
  subtitle:
    'Choose a template, let AI draft your summary and experience, edit every word, and export to PDF or Word.',
  hero_title: 'Build Your CV with AI',
  hero_desc:
    'Start from a template, and AI drafts your professional summary and experience from what you tell it about your work. Every line is editable. When it reads the way you want, export to PDF or Word.',
  cta_btn: 'Create your CV free',
  mid_title: 'What the AI actually writes',
  mid_subtitle: 'AI drafts the parts most people get stuck on. You keep control of every word.',
  mid1_title: 'Your professional summary',
  mid1_desc:
    'Describe your role and experience, and AI drafts the opening paragraph. Rewrite any part of it — the draft is a starting point, not a final answer.',
  mid2_title: 'Experience bullets',
  mid2_desc:
    'Turn what you did into clear, specific bullet points. AI suggests phrasing; you decide what stays and whether it reflects your work accurately.',
  mid3_title: 'Cover letters',
  mid3_desc:
    'Paste a job description and generate a cover letter linked to your CV. Same rule — review it before sending, and make sure it represents you truthfully.',
  mid4_title: 'Formatting built to be parsed',
  mid4_desc:
    'Templates use standard section headings and clear text structure, so applicant tracking systems can read your details rather than losing them in a layout. How any individual system interprets a CV is outside our control.',
  close_title: 'From blank page to finished CV',
  close_subtitle:
    'Three steps, and you can stop and come back at any point — everything saves as you go.',
  close1_title: 'Start from a template or your old CV',
  close1_desc:
    'Pick a template, or paste an existing CV and let AI pull out your details into an editable structure.',
  close2_title: 'Fill in with AI help where you want it',
  close2_desc: 'Write it yourself, or use AI on the sections you find hardest. Both work, and you can mix them.',
  close3_title: 'Export and apply',
  close3_desc:
    'Download as PDF or Word. Check names, dates and employment history are accurate before you send it to an employer.',
  cta_title: 'Start building your CV',
  related_title: 'Applying for a specific role?',
  related_cta: 'Generate a cover letter from your CV',
} as const;
