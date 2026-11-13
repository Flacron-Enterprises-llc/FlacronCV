import { t } from '../i18n';
import { TicketCategory, TicketPriority, TicketStatus } from './enums';

export interface TicketAttachment {
  name: string;
  url: string;
  type: string;
  size: number;
}

/** Matches shared-types / API `TicketMessage` (customer-visible fields). */
export interface TicketMessage {
  id: string;
  authorId: string;
  authorName: string;
  authorRole: 'user' | 'admin';
  content: string;
  attachments?: TicketAttachment[];
  createdAt: string;
}

/** Matches shared-types / API `SupportTicket`. */
export interface SupportTicket {
  id: string;
  userId: string;
  userEmail: string;
  userDisplayName: string;
  subject: string;
  category: TicketCategory;
  priority: TicketPriority;
  status: TicketStatus;
  assignedTo?: string | null;
  assignedToName?: string | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string | null;
  closedAt?: string | null;
  /** Flattened onto the ticket by `useSupportTicket` after GET. */
  messages?: TicketMessage[];
}

/** Matches CreateTicketDto — not the form field names. */
export interface CreateTicketData {
  subject: string;
  message: string;
  category: TicketCategory;
  priority?: TicketPriority;
}

/** Website `support.statusLabels` wording, read in the current language at call time. */
const TICKET_STATUS_LABEL: Record<TicketStatus, () => string> = {
  [TicketStatus.OPEN]: () => t('support.status.open'),
  [TicketStatus.IN_PROGRESS]: () => t('support.status.inProgress'),
  [TicketStatus.WAITING_ON_CUSTOMER]: () => t('support.status.waitingOnCustomer'),
  [TicketStatus.RESOLVED]: () => t('support.status.resolved'),
  [TicketStatus.CLOSED]: () => t('support.status.closed'),
};

/** Ticket status label; an unknown status is shown as sent (underscores → spaces). */
export function ticketStatusLabel(status: string): string {
  const label = TICKET_STATUS_LABEL[status as TicketStatus];
  return label ? label() : (status ?? '').replace(/_/g, ' ');
}

const TICKET_CATEGORY_LABEL: Record<TicketCategory, () => string> = {
  [TicketCategory.GENERAL]: () => t('support.categories.general'),
  [TicketCategory.BUG]: () => t('support.categories.bug'),
  [TicketCategory.FEATURE_REQUEST]: () => t('support.categories.featureRequest'),
  [TicketCategory.BILLING]: () => t('support.categories.billing'),
  [TicketCategory.ACCOUNT]: () => t('support.categories.account'),
};

/** Ticket category label; an unknown category is shown as sent (underscores → spaces). */
export function ticketCategoryLabel(category: string): string {
  const label = TICKET_CATEGORY_LABEL[category as TicketCategory];
  return label ? label() : (category ?? '').replace(/_/g, ' ');
}
