/**
 * English-only Play “Delete account URL” copy for /en/delete-account.
 *
 * Informational — not an accepted legal document. Do not add to
 * LEGAL_VERSION_MAP, do not stamp LEGAL_VERSION, do not bump LEGAL_VERSION.
 * Same chrome as LegalDocumentView; own last-updated date.
 */
import { ol, p, ul, section, type LegalBlock, type LegalSection } from '@/legal/types';

export const DELETE_ACCOUNT_PATH = '/delete-account';
export const DELETE_ACCOUNT_LAST_UPDATED = 'August 28, 2026';

export const DELETE_ACCOUNT: {
  path: typeof DELETE_ACCOUNT_PATH;
  title: string;
  description: string;
  lastUpdated: typeof DELETE_ACCOUNT_LAST_UPDATED;
  preamble: LegalBlock[];
  sections: LegalSection[];
} = {
  path: DELETE_ACCOUNT_PATH,
  title: 'Delete your FlacronCV account',
  description:
    'This page explains how to delete a FlacronCV account (the FlacronCV app and website operated by Flacron Enterprises). Uninstalling the FlacronCV app from your device does not delete your account.',
  lastUpdated: DELETE_ACCOUNT_LAST_UPDATED,
  preamble: [
    p(
      'This page explains how to delete a FlacronCV account (the FlacronCV app and website operated by Flacron Enterprises). Uninstalling the FlacronCV app from your device does not delete your account.',
    ),
  ],
  sections: [
    section('how', 'How to request deletion', [
      ol([
        'Open FlacronCV on the web at flacroncv.com and sign in.',
        'Go to Settings.',
        'Open the Danger Zone section and choose Delete Account.',
        'Type DELETE to confirm.',
      ]),
      p(
        'That step deactivates your account immediately. You are signed out on every device and cannot sign in again.',
      ),
      p(
        'The FlacronCV mobile app does not yet include a delete-account button. Use the website steps above, or email us (below) if you cannot sign in or have already uninstalled the app.',
      ),
    ]),
    section('deactivated', 'What is deactivated immediately', [
      ul([
        'Your ability to sign in (your login is disabled and all sessions are ended).',
        'Any paid FlacronCV subscription is cancelled so you are not billed further.',
      ]),
    ]),
    section('not-deleted', 'What is not deleted by that step', [
      p(
        'Your stored data remains until we complete a separate erasure request. That includes:',
      ),
      ul([
        'Your account profile and email address',
        'CVs, cover letters, and job-application records',
        'Support tickets and messages you sent us',
        'Files generated for export',
        'Your legal-acceptance record',
        'Billing records held by our payment processor (the subscription is cancelled; the customer record may remain as required for accounting)',
      ]),
    ]),
    section('permanent', 'Permanent deletion', [
      p(
        'To have remaining account data permanently deleted, email contact@flacroncv.com from the address on the account, with the subject “Delete my FlacronCV account”. We complete that erasure within 30 days of a valid request.',
      ),
      p(
        'If you only deactivate the account and do not email us, the stored data listed above is kept while the account remains deactivated.',
      ),
    ]),
    section('kept', 'What we may keep', [
      p(
        'We may retain information we are legally required to keep (for example billing and tax records) for the period the law requires. After erasure, we do not keep your CVs or cover letters for product use.',
      ),
    ]),
    section('download', 'Download a copy first', [
      p(
        'While you can still sign in, Settings → Download my data gives you a JSON copy of your account, CVs, cover letters, job applications, and support tickets.',
      ),
    ]),
  ],
};
