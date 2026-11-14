/**
 * Translated labels for the CRM's stored enum values.
 *
 * The CRM used to print the raw values ("closed_won", "whatsapp", "refunded")
 * in dropdowns and tables, in English in every locale. These map each value to
 * its key in the `crm` namespace and fall back to the raw value for anything
 * new, so an unexpected value still shows something readable.
 */
type T = (key: string) => string;

const STAGE_KEYS: Record<string, string> = {
  new: 'stage_new',
  contacted: 'stage_contacted',
  qualified: 'stage_qualified',
  proposal: 'stage_proposal',
  closed_won: 'stage_won',
  closed_lost: 'stage_lost',
};

const SOURCE_KEYS: Record<string, string> = {
  manual: 'source_manual',
  website: 'source_website',
  whatsapp: 'source_whatsapp',
  referral: 'source_referral',
  social: 'source_social',
  email: 'source_email',
  other: 'source_other',
};

const CUSTOMER_STATUS_KEYS: Record<string, string> = {
  active: 'status_active',
  inactive: 'status_inactive',
  lead: 'status_lead',
};

const TX_STATUS_KEYS: Record<string, string> = {
  pending: 'pending',
  completed: 'completed',
  refunded: 'refunded',
  failed: 'failed',
};

const label = (map: Record<string, string>) => (t: T, value: string | null | undefined): string => {
  if (!value) return '';
  const key = map[value];
  return key ? t(key) : value.replace(/_/g, ' ');
};

export const leadStageLabel = label(STAGE_KEYS);
export const customerSourceLabel = label(SOURCE_KEYS);
export const customerStatusLabel = label(CUSTOMER_STATUS_KEYS);
export const transactionStatusLabel = label(TX_STATUS_KEYS);
