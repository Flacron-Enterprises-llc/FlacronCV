/**
 * Marketing lead capture (Epic C). Deliberately SEPARATE from CRM sales-leads
 * (`crm.types`): these are newsletter / lead-magnet opt-ins with a GDPR consent
 * record and double-opt-in, not pipeline deals.
 */

export enum LeadStatus {
  /** Captured, awaiting double-opt-in email confirmation. */
  PENDING = 'pending',
  /** Confirmed opt-in. */
  SUBSCRIBED = 'subscribed',
  UNSUBSCRIBED = 'unsubscribed',
}

/**
 * Immutable proof of exactly what the user consented to, when, and where —
 * required to demonstrate GDPR-valid consent.
 */
export interface ConsentRecord {
  granted: boolean;
  /** The exact consent copy shown at capture time. */
  text: string;
  /** Version identifier for that copy (so you can prove which text applied). */
  version: string;
  /** ISO-8601 timestamp of when consent was given. */
  date: string;
  /** Which form / lead magnet / page captured it. */
  source: string;
  /** Best-effort IP at capture (may be null). */
  ip?: string | null;
}

export interface Lead {
  id: string;
  /** Normalized (lower-cased, trimmed) email — the dedupe key. */
  email: string;
  name: string | null;
  source: string;
  status: LeadStatus;
  consent: ConsentRecord;
  /** Unguessable double-opt-in token; cleared once confirmed. */
  confirmationToken: string | null;
  /** Unguessable token backing the one-click unsubscribe link. */
  unsubscribeToken: string;
  createdAt: Date;
  updatedAt: Date;
  confirmedAt: Date | null;
  unsubscribedAt: Date | null;
}

/** Payload for capturing a lead. `consent` MUST be true (never pre-selected). */
export interface CreateLeadData {
  email: string;
  name?: string;
  source: string;
  consent: boolean;
  consentText: string;
  consentVersion: string;
}
