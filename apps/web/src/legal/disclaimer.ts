import {
  LEGAL_LAST_UPDATED,
  LEGAL_VERSION,
  type LegalDocument,
  p,
  ul,
  section,
} from './types';

export const DISCLAIMER: LegalDocument = {
  id: 'disclaimer',
  version: LEGAL_VERSION,
  lastUpdated: LEGAL_LAST_UPDATED,
  path: '/disclaimer',
  title: 'FlacronCV AI, ATS & Employment Disclaimer',
  description:
    'FlacronCV provides AI-powered writing, CV-building, ATS compatibility, and career-document tools. FlacronCV does not guarantee employment, interviews, job offers, recruiter responses, ATS rankings, or other career outcomes.',
  preamble: [
    p('Important Notice'),
    p(
      'FlacronCV provides AI-powered writing, CV-building, ATS compatibility, and career-document tools. FlacronCV does not guarantee employment, interviews, job offers, recruiter responses, ATS rankings, or other career outcomes.',
    ),
    p('FlacronCV is operated by Flacron Enterprises and is Powered by Flacron Engine.'),
  ],
  sections: [
    section('1', '1. AI Assistance Only', [
      p('FlacronCV may use artificial intelligence to help users:'),
      ul([
        'Draft CV content',
        'Rewrite content',
        'Improve wording',
        'Generate summaries',
        'Generate bullet points',
        'Suggest skills',
        'Generate Cover Letters',
        'Analyze job descriptions',
        'Provide ATS-related suggestions',
        'Provide role-based recommendations',
      ]),
      p('AI output is provided as assistance only.'),
    ]),
    section('2', '2. AI May Be Wrong', [
      p('Artificial intelligence may generate information that is:'),
      ul([
        'Incorrect',
        'Incomplete',
        'Inaccurate',
        'Misleading',
        'Inconsistent',
        'Unsuitable',
        'Outdated',
      ]),
      p('Always review generated content before submitting it.'),
    ]),
    section('3', '3. No Employment Guarantee', [
      p('FlacronCV does not guarantee:'),
      ul([
        'Job interviews',
        'Employment',
        'Job offers',
        'Recruiter responses',
        'Employer interest',
        'Promotions',
        'Salary increases',
        'Career advancement',
      ]),
    ]),
    section('4', '4. ATS Scores Are Estimates', [
      p('FlacronCV may provide:'),
      ul([
        'ATS scores',
        'ATS compatibility indicators',
        'Keyword analysis',
        'Job matching',
        'Skills matching',
        'Formatting suggestions',
      ]),
      p('These indicators are estimates.'),
      p(
        "No score guarantees that a particular employer's ATS will interpret, rank, or accept your CV in the same way.",
      ),
    ]),
    section('5', '5. Employer Systems Vary', [
      p('Employers may use different:'),
      ul([
        'Applicant tracking systems',
        'Keyword rules',
        'Ranking systems',
        'Recruiter workflows',
        'Hiring policies',
        'Screening criteria',
      ]),
      p('FlacronCV does not control these systems.'),
    ]),
    section('6', '6. User Responsibility', [
      p('Before applying for a job, you are responsible for verifying:'),
      ul([
        'Your name',
        'Contact information',
        'Employment dates',
        'Employer names',
        'Education',
        'Certifications',
        'Licenses',
        'Skills',
        'Accomplishments',
        'References',
        'Other factual statements',
      ]),
    ]),
    section('7', '7. No Fabrication', [
      p('Do not use AI-generated suggestions to claim:'),
      ul([
        'Jobs you never held',
        'Degrees you never earned',
        'Skills you do not have',
        'Certifications you do not possess',
        'Accomplishments that are not true',
        'Professional licenses you do not hold',
      ]),
    ]),
    section('8', '8. Career and Professional Information', [
      p('FlacronCV may provide general career-oriented suggestions.'),
      p(
        'These are informational tools and should not be treated as a guarantee or individualized professional employment-service representation.',
      ),
    ]),
    section('app-wide', 'Required App-Wide Disclaimer', [
      p('Display on relevant ATS and AI screens:'),
      p(
        'AI-generated suggestions may contain errors. Review all content before submitting your CV. ATS scores are estimates and do not guarantee interviews, rankings, job offers, or employment.',
      ),
    ]),
    section('export', 'Required Export Disclaimer', [
      p('Where appropriate, exported documents may be accompanied by:'),
      p(
        'This document was created using AI-assisted tools. The user is responsible for reviewing all information for accuracy before submission.',
      ),
      p(
        "This disclaimer does not necessarily need to appear directly on the user's CV unless FlacronCV chooses to require it.",
      ),
    ]),
    section('contact', 'Contact', [
      p('FlacronCV'),
      p('Operated by Flacron Enterprises'),
      p('410 E 95th St'),
      p('Brooklyn, NY 11212'),
      p('United States'),
      p('Phone: 929-990-1182'),
      p('FlacronCV Email: contact@flacroncv.com'),
      p('Parent Company Email: Contact@flacronenterprises.com'),
      p('Powered by Flacron Engine'),
    ]),
  ],
};
