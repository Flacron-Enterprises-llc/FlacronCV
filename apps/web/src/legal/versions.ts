import { LEGAL_VERSION } from './types';
import { TERMS } from './terms';
import { DISCLAIMER } from './disclaimer';
import { REFUND } from './refund';
import { COOKIES } from './cookies';

/**
 * Per-document versions for Batch H (acceptance modal / legalAcceptances).
 * Do not build the modal or the collection here.
 *
 * Privacy is recorded at the client package date but is NOT published from
 * this module — MC1 is blocked until the client names AWS SES and OpenAI in §4.
 */
export const LEGAL_DOCUMENTS = {
  terms: TERMS,
  disclaimer: DISCLAIMER,
  refund: REFUND,
  cookies: COOKIES,
} as const;

export const LEGAL_VERSION_MAP = {
  terms: { version: LEGAL_VERSION, status: 'published' as const, path: '/terms-of-service' },
  disclaimer: { version: LEGAL_VERSION, status: 'published' as const, path: '/disclaimer' },
  refund: { version: LEGAL_VERSION, status: 'published' as const, path: '/refund-policy' },
  cookies: { version: LEGAL_VERSION, status: 'published' as const, path: '/cookie-policy' },
  privacy: {
    version: LEGAL_VERSION,
    status: 'pending-client-subprocessors' as const,
    path: '/privacy-policy',
    liveSource: 'locale-json' as const,
  },
} as const;
