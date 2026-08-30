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
