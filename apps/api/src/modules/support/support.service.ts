import { Injectable, NotFoundException } from '@nestjs/common';
import { FirebaseAdminService } from '../firebase/firebase-admin.service';
import { SupportTicket, TicketMessage, CreateTicketData, TicketStatus, TicketPriority } from '@flacroncv/shared-types';
import { v4 as uuidv4 } from 'uuid';

/**
 * A ticket message as it is STORED.
 *
 * `internal` marks an internal note: agent-only commentary that the customer
 * must never see. It is optional on purpose — every message written before this
 * feature existed has no such field, and "absent" must always read as
 * "customer-visible". Never invert this flag (e.g. `visibleToCustomer`), or
 * legacy notes-free messages would silently become hidden.
 */
export interface StoredTicketMessage extends TicketMessage {
  internal?: boolean;
}

@Injectable()
export class SupportService {
  private readonly collection = 'support_tickets';

  constructor(private firebaseAdmin: FirebaseAdminService) {}

  async createTicket(userId: string, userEmail: string, userName: string, data: CreateTicketData): Promise<SupportTicket> {
    const id = uuidv4();
    const now = new Date();

    const ticket: SupportTicket = {
      id,
      userId,
      userEmail,
      userDisplayName: userName,
      subject: data.subject,
      category: data.category,
      priority: data.priority || TicketPriority.MEDIUM,
      status: TicketStatus.OPEN,
      assignedTo: null,
      assignedToName: null,
      createdAt: now,
      updatedAt: now,
      resolvedAt: null,
      closedAt: null,
    };

    await this.firebaseAdmin.firestore.collection(this.collection).doc(id).set(ticket);

    // Add first message
    await this.addMessage(id, userId, userName, 'user', data.message);

    return ticket;
  }

  async getTicket(id: string): Promise<SupportTicket> {
    const doc = await this.firebaseAdmin.firestore.collection(this.collection).doc(id).get();
    if (!doc.exists) throw new NotFoundException('Ticket not found');
    return doc.data() as SupportTicket;
  }

  async listByUser(userId: string) {
    const snapshot = await this.firebaseAdmin.firestore
      .collection(this.collection)
      .where('userId', '==', userId)
      .orderBy('createdAt', 'desc')
      .get();
    return snapshot.docs.map((doc: any) => doc.data() as SupportTicket);
  }

  async listAll(status?: string, page = 1, limit = 20): Promise<{ items: SupportTicket[]; total: number; page: number; limit: number }> {
    const safeLimit = Math.min(limit, 100);
    let query: FirebaseFirestore.Query = this.firebaseAdmin.firestore
      .collection(this.collection)
      .orderBy('createdAt', 'desc');

    if (status) query = query.where('status', '==', status);

    const countSnap = await query.count().get();
    const total = countSnap.data().count;

    const offset = (page - 1) * safeLimit;
    const snapshot = await query.offset(offset).limit(safeLimit).get();
    const items = snapshot.docs.map((doc) => doc.data() as SupportTicket);

    return { items, total, page, limit: safeLimit };
  }

  async addMessage(ticketId: string, authorId: string, authorName: string, authorRole: 'user' | 'admin', content: string): Promise<TicketMessage> {
    const id = uuidv4();
    const message: TicketMessage = {
      id,
      authorId,
      authorName,
      authorRole,
      content,
      attachments: [],
      createdAt: new Date(),
    };

    await this.firebaseAdmin.firestore
      .collection(this.collection)
      .doc(ticketId)
      .collection('messages')
      .doc(id)
      .set(message);

    // Status must reflect whose court the ball is in. A customer message (including
    // the opening message on ticket creation) means support now owes a reply → OPEN.
    // An agent reply means we're now waiting on the customer → WAITING_ON_CUSTOMER.
    // (The previous mapping was inverted: new tickets and customer replies were marked
    // WAITING_ON_CUSTOMER, hiding them from the agent "needs a reply" queue.)
    await this.firebaseAdmin.firestore.collection(this.collection).doc(ticketId).update({
      updatedAt: new Date(),
      status: authorRole === 'admin' ? TicketStatus.WAITING_ON_CUSTOMER : TicketStatus.OPEN,
    });

    return message;
  }

  /**
   * Add an internal note — agent-only commentary on a ticket.
   *
   * A note is NOT a reply, and differs from `addMessage` in exactly two ways:
   *  1. it is stored with `internal: true`, so `getMessages` (the read behind the
   *     customer-facing GET /support/tickets/:id) filters it out; and
   *  2. it does not touch `status`. Nobody outside support has seen the note, so
   *     moving the ticket to WAITING_ON_CUSTOMER would park it in a queue waiting
   *     on a customer who was never asked anything. Only `updatedAt` is bumped,
   *     so the ticket still sorts as recently worked.
   *
   * Authorisation lives at the route: this is only reachable from the
   * @Roles('admin','super_admin') AdminController.
   */
  async addInternalNote(
    ticketId: string,
    authorId: string,
    authorName: string,
    content: string,
  ): Promise<StoredTicketMessage> {
    const id = uuidv4();
    const note: StoredTicketMessage = {
      id,
      authorId,
      authorName,
      authorRole: 'admin',
      content,
      attachments: [],
      createdAt: new Date(),
      internal: true,
    };

    await this.firebaseAdmin.firestore
      .collection(this.collection)
      .doc(ticketId)
      .collection('messages')
      .doc(id)
      .set(note);

    await this.firebaseAdmin.firestore.collection(this.collection).doc(ticketId).update({
      updatedAt: new Date(),
    });

    return note;
  }

  /**
   * The CUSTOMER-FACING thread.
   *
   * Internal notes are filtered out HERE rather than at the controller because
   * this is the method the user-facing GET /support/tickets/:id calls: making the
   * safe behaviour the default means a note cannot leak through a caller that
   * forgot to filter. The flag itself is stripped from what is returned, so the
   * customer payload carries no trace of a note either.
   */
  async getMessages(ticketId: string): Promise<TicketMessage[]> {
    const all = await this.readMessages(ticketId);
    return all
      .filter((message) => !SupportService.isInternal(message))
      .map((message) => {
        const visible: StoredTicketMessage = { ...message };
        delete visible.internal;
        return visible as TicketMessage;
      });
  }

  /**
   * The internal notes on a ticket. Serve this ONLY from admin-gated routes —
   * it is the sole path by which a note ever leaves the database.
   */
  async getInternalNotes(ticketId: string): Promise<StoredTicketMessage[]> {
    const all = await this.readMessages(ticketId);
    return all.filter((message) => SupportService.isInternal(message));
  }

  /** Any truthy `internal` hides a message from the customer (fail closed). */
  private static isInternal(message: StoredTicketMessage): boolean {
    return Boolean(message.internal);
  }

  private async readMessages(ticketId: string): Promise<StoredTicketMessage[]> {
    const snapshot = await this.firebaseAdmin.firestore
      .collection(this.collection)
      .doc(ticketId)
      .collection('messages')
      .orderBy('createdAt', 'asc')
      .get();
    return snapshot.docs.map((doc: any) => doc.data() as StoredTicketMessage);
  }

  // Fields an admin (or the internal closeTicket path) may update on a ticket.
  // Whitelisting stops a raw PATCH body from rewriting identity/ownership fields
  // (userId, id, createdAt, userEmail, …) — e.g. reassigning a ticket to another
  // user, which the ownership guard would then use to lock the real owner out.
  private static readonly UPDATABLE_FIELDS: readonly (keyof SupportTicket)[] = [
    'status',
    'priority',
    'assignedTo',
    'assignedToName',
    'resolvedAt',
    'closedAt',
  ];

  async updateTicket(id: string, data: Partial<SupportTicket>): Promise<SupportTicket> {
    const sanitized: Partial<SupportTicket> = {};
    for (const key of SupportService.UPDATABLE_FIELDS) {
      if (data[key] !== undefined) {
        (sanitized as Record<string, unknown>)[key] = data[key];
      }
    }
    await this.firebaseAdmin.firestore.collection(this.collection).doc(id).update({
      ...sanitized,
      updatedAt: new Date(),
    });
    return this.getTicket(id);
  }

  async closeTicket(id: string): Promise<SupportTicket> {
    return this.updateTicket(id, { status: TicketStatus.CLOSED, closedAt: new Date() });
  }
}
