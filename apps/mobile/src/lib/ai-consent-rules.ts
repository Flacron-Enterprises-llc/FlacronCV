/** Which requests send content to the AI provider, and the refusal error. Pure: no native modules. */
export class AiConsentDeclinedError extends Error {
  constructor() {
    super('ai_consent_declined');
    this.name = 'AiConsentDeclinedError';
  }
}

/** Code the career client sees when the person has not allowed AI sharing. */
export const AI_CONSENT_DECLINED = 'ai_consent_declined';

/** V1 API calls whose content goes to the AI provider. */
export function isV1AiRequest(method: string | undefined, url: string | undefined): boolean {
  if ((method ?? 'get').toLowerCase() !== 'post') return false;
  const path = (url ?? '').split('?')[0]!;
  return /(^|\/)ai\//.test(path);
}

const CAREER_AI_PATHS = [
  /\/imports$/,
  /\/resumes\/[^/]+\/(generate|tailor)$/,
  /\/writing$/,
  /\/analyses$/,
  /\/matches$/,
  /\/interviews\/text(\/[^/]+\/(answers|challenges))?$/,
  /\/interviews\/voice\/[^/]+\/transcription$/,
  /\/coaching$/,
  /\/action-packs(\/[^/]+\/retry)?$/,
  /\/learning\/skill-reports$/,
];

/** Career API calls that use the text model or speech transcription. */
export function isCareerAiRequest(method: string | undefined, url: string): boolean {
  if ((method ?? 'GET').toUpperCase() !== 'POST') return false;
  const path = url.split('?')[0]!;
  return CAREER_AI_PATHS.some((re) => re.test(path));
}
