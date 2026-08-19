import { LEGAL_VERSION } from './types';
import { TERMS } from './terms';
import { DISCLAIMER } from './disclaimer';
import { REFUND } from './refund';
import { COOKIES } from './cookies';

/**
 * Per-document versions for Batch H (acceptance modal / legalAcceptances).
 *
 * Privacy is stamped at LEGAL_VERSION even though the live `/privacy-policy`
 * body is still locale JSON (`liveSource: 'locale-json'`, status
 * `pending-client-subprocessors`). Recorded version and published body will
 * not match until B.1 lands — that is a deliberate gap, not a bug.
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
