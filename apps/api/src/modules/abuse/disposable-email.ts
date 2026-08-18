/**
 * Static disposable-domain list. No npm package — a missing lockfile change
 * is a standing constraint, and a remote feed would be a new dependency of
 * signup. Extend in place; match is exact domain (lowercased).
 */
const DISPOSABLE_DOMAINS = new Set([
  '0-mail.com',
  '10mail.org',
  '10minutemail.com',
  '10minutemail.net',
  '33mail.com',
  'binkmail.com',
  'cool.fr.nf',
  'courriel.fr.nf',
  'discard.email',
  'dispostable.com',
  'dodgit.com',
  'dropmail.me',
  'emailondeck.com',
  'fakeinbox.com',
  'getairmail.com',
  'getnada.com',
  'grr.la',
  'guerrillamail.com',
  'guerrillamail.net',
  'guerrilla.email',
  'inboxkitten.com',
  'jetable.fr.nf',
  'jetable.org',
  'kasmail.com',
  'mailcatch.com',
  'maildrop.cc',
  'mailinator.com',
  'mailinator.net',
  'mailinator.org',
  'mailnesia.com',
  'mailnull.com',
  'mailtemp.net',
  'meltmail.com',
  'mintemail.com',
  'mohmal.com',
  'mytemp.email',
  'nospam.ze.tc',
  'sharklasers.com',
  'spambox.us',
  'spamfree24.org',
  'spamgourmet.com',
  'speed.1s.fr',
  'temp-mail.org',
  'tempail.com',
  'tempmail.com',
  'throwaway.email',
  'tmpmail.net',
  'tmpmail.org',
  'trashmail.com',
  'trashmailer.com',
  'trashymail.com',
  'yopmail.com',
  'yopmail.fr',
  'yopmail.net',
]);

export function isDisposableEmail(email: string | undefined | null): boolean {
  if (!email) return false;
  const at = email.lastIndexOf('@');
  if (at < 0 || at === email.length - 1) return false;
  const domain = email.slice(at + 1).trim().toLowerCase();
  return DISPOSABLE_DOMAINS.has(domain);
}
