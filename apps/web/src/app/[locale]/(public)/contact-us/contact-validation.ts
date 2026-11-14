/**
 * Client-side checks for the contact form, kept in step with the API's
 * ContactService validation so a message the server would refuse is caught
 * before it is sent.
 */

export type ContactField = 'name' | 'email' | 'message';

/**
 * Same rule as the API: something@domain.tld. The browser's own type="email"
 * check accepts "jane@localhost", which the API rejects with a 400, so the
 * form needs this stricter test of its own.
 */
export function isValidContactEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@.]+$/.test(value.trim());
}

/**
 * Which field a 400 from POST /contact is about. The API words its messages
 * "<Field> is required." / "<Field> must be at most N characters." /
 * "A valid email address is required.". Returns null when it cannot tell, so
 * the caller shows the error on the form as a whole.
 */
export function fieldForServerMessage(message: string | undefined): ContactField | null {
  if (!message) return null;
  if (/email/i.test(message)) return 'email';
  if (/^Name\b/.test(message)) return 'name';
  if (/^Message\b/.test(message)) return 'message';
  return null;
}
