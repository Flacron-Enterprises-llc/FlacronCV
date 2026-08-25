/**
 * English-only landing copy for /en/ats-cv-checker.
 *
 * Same mechanism as `/en/ai-cv-builder` (`englishDocument: true`, sitemap
 * ENGLISH_DOCUMENT_PATHS). Do not move these strings into common.json unless
 * the page is being translated. Do not render them through LegalDocumentView.
 * This is not a public checker — the copy must not read as one.
 */
export const ATS_CV_CHECKER_PATH = '/ats-cv-checker';

export const ATS_CV_CHECKER = {
  title: 'ATS CV Checker — Compare Your CV to a Job Posting',
  subtitle:
    'Paste a job description and see which keywords your CV matches and which it misses. A signed-in feature, one AI credit per check.',
  hero_title: 'Check Your CV Against a Job Posting',
  hero_desc:
    'Paste the posting you are applying to, and get a comparison of its wording against your CV — which terms you already use, which you do not, and what you might add. You will need an account and a CV built here; each check uses one AI credit.',
  cta_btn: 'Create an account to check your CV',
  limit_title: 'What this is, and what it is not',
  limit_desc:
    "This compares the words in your CV to the words in one job posting. It does not open a real applicant tracking system, and it cannot tell you how a particular employer's software will read your file or whether you will be shortlisted. The score is an estimate for that one posting, not a verdict on your CV and not a prediction of any outcome.",
  mid_title: 'What comes back',
  mid_subtitle: 'Three things, all specific to the posting you paste.',
  mid1_title: 'A match estimate',
  mid1_desc:
    'A number between 0 and 100 showing how closely your wording lines up with that posting. Paste a different posting and the number changes — it describes the pair, not your CV on its own.',
  mid2_title: 'Matched and missing terms',
  mid2_desc:
    'Which words and phrases from the posting already appear in your CV, and which do not. Useful for spotting a skill you have but did not name.',
  mid3_title: 'Suggestions you decide on',
  mid3_desc:
    'Prompts for what you might add or reword. Adopt what is accurate to your experience and ignore the rest — never add something you cannot stand behind in an interview.',
  how_title: 'How to run a check',
  how_desc:
    'Create an account, build or import a CV, then open it and paste the job description into the ATS check. Each check uses one AI credit, and every plan including Free comes with credits to start.',
  cta_title: 'Check your CV against a real posting',
  related_title: 'Start here first',
  related_cv_cta: 'Build your CV with AI',
  related_templates_cta: 'Browse templates',
} as const;
