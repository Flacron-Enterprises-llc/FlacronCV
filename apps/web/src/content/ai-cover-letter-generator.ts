/**
 * English-only landing copy for /en/ai-cover-letter-generator.
 *
 * Same mechanism as the legal pages and /en/ai-cv-builder (`englishDocument:
 * true`, sitemap ENGLISH_DOCUMENT_PATHS). Do not move these strings into
 * common.json unless the page is being translated. Do not render them through
 * LegalDocumentView.
 */
export const AI_COVER_LETTER_GENERATOR_PATH = '/ai-cover-letter-generator';

export const AI_COVER_LETTER_GENERATOR = {
  title: 'AI Cover Letter Generator — Written From Your CV',
  subtitle:
    'Paste a job description, and AI drafts a cover letter using your CV. Edit every line, then export to PDF or Word.',
  hero_title: 'Write Cover Letters From Your CV',
  hero_desc:
    'Paste the job description. AI drafts a letter using the experience already in your CV, so you are not retyping your career for every application. Rewrite anything you want before it goes anywhere.',
  cta_btn: 'Write a cover letter free',
  mid_title: 'How the draft comes together',
  mid_subtitle: 'Three inputs, one draft, and you keep control of the wording.',
  mid1_title: 'The job description',
  mid1_desc:
    'Paste the posting you are applying to. The draft picks up the language and requirements from it rather than producing something generic.',
  mid2_title: 'Your CV as the source',
  mid2_desc:
    'Link a CV you have already built and the letter draws from that experience. No re-entering roles, dates, or achievements.',
  mid3_title: 'A draft, not a final letter',
  mid3_desc:
    'What comes back is a starting point. Change the tone, cut what does not apply, add what the AI could not know. The words that go out should be yours.',
  close_title: 'From job posting to letter you can send',
  close_subtitle: 'Three steps, and nothing sends until you decide it is ready.',
  close1_title: 'Start with a CV',
  close1_desc: 'Build one here or import an existing CV. The letter needs something to draw from.',
  close2_title: 'Paste the posting and generate',
  close2_desc:
    'Add the job description and any details about the company or role, then generate a draft in seconds.',
  close3_title: 'Review before you send',
  close3_desc:
    'Read it properly. Check that every claim about your experience is accurate and that it represents you truthfully — you are responsible for what you submit. Then export to PDF or Word.',
  cta_title: 'Write your first cover letter',
  related_title: 'Need a CV first?',
  related_cta: 'Build your CV with AI',
} as const;
