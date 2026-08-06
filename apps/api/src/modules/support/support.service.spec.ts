import { SupportService } from './support.service';
import { SupportController } from './support.controller';
import { InMemoryFirestore } from '../firebase/in-memory-firestore';
import { TicketCategory, TicketPriority, TicketStatus } from '@flacroncv/shared-types';

function makeService() {
  const firestore = new InMemoryFirestore();
  const service = new SupportService({ firestore } as any);
  return { service, firestore };
}

async function seedTicket(service: SupportService, owner = 'owner-1') {
  return service.createTicket(owner, `${owner}@example.com`, 'Owner', {
    subject: 'Need help',
    category: TicketCategory.GENERAL,
    message: 'Something is not working',
  });
}

describe('SupportService', () => {
  // ─── B1: status reflects whose court the ball is in ─────────────────────────
  describe('ticket status transitions (B1)', () => {
    it('a newly created ticket is OPEN — the opening message is from the customer', async () => {
      const { service } = makeService();
      const ticket = await seedTicket(service);
      expect((await service.getTicket(ticket.id)).status).toBe(TicketStatus.OPEN);
    });

    it('an agent reply moves the ticket to WAITING_ON_CUSTOMER', async () => {
      const { service } = makeService();
      const ticket = await seedTicket(service);
      await service.addMessage(ticket.id, 'admin-1', 'Agent', 'admin', 'Looking into it');
      expect((await service.getTicket(ticket.id)).status).toBe(TicketStatus.WAITING_ON_CUSTOMER);
    });

    it('a customer reply moves the ticket back to OPEN (it needs an agent again)', async () => {
      const { service } = makeService();
      const ticket = await seedTicket(service);
      await service.addMessage(ticket.id, 'admin-1', 'Agent', 'admin', 'Any update?');
      expect((await service.getTicket(ticket.id)).status).toBe(TicketStatus.WAITING_ON_CUSTOMER);

      await service.addMessage(ticket.id, 'owner-1', 'Owner', 'user', 'Here is more detail');
      expect((await service.getTicket(ticket.id)).status).toBe(TicketStatus.OPEN);
    });
  });

  // ─── B3: updateTicket whitelists admin-updatable fields ─────────────────────
  describe('updateTicket field whitelist (B3)', () => {
    it('drops identity/ownership fields (userId, id, createdAt) while applying allowed ones', async () => {
      const { service } = makeService();
      const ticket = await seedTicket(service);

      await service.updateTicket(ticket.id, {
        userId: 'attacker',
        id: 'evil-id',
        createdAt: new Date(0),
        userEmail: 'attacker@example.com',
        status: TicketStatus.RESOLVED,
      });

      const persisted = await service.getTicket(ticket.id);
      expect(persisted.userId).toBe('owner-1'); // ownership NOT reassigned
      expect(persisted.id).toBe(ticket.id); // id NOT overwritten
      expect(persisted.userEmail).toBe('owner-1@example.com');
      expect(persisted.status).toBe(TicketStatus.RESOLVED); // whitelisted field applied
    });

    it('applies whitelisted assignment/priority fields', async () => {
      const { service } = makeService();
      const ticket = await seedTicket(service);

      await service.updateTicket(ticket.id, {
        priority: TicketPriority.URGENT,
        assignedTo: 'agent-1',
        assignedToName: 'Agent One',
      });

      const persisted = await service.getTicket(ticket.id);
      expect(persisted.priority).toBe(TicketPriority.URGENT);
      expect(persisted.assignedTo).toBe('agent-1');
      expect(persisted.assignedToName).toBe('Agent One');
    });

    it('closeTicket sets status CLOSED and stamps closedAt', async () => {
      const { service } = makeService();
      const ticket = await seedTicket(service);

      await service.closeTicket(ticket.id);

      const persisted = await service.getTicket(ticket.id);
      expect(persisted.status).toBe(TicketStatus.CLOSED);
      expect(persisted.closedAt).toBeTruthy();
    });
  });

  // ─── §12: internal notes are agent-only ─────────────────────────────────────
  describe('internal notes (§12)', () => {
    const SECRET = 'Refund already approved — do NOT mention the goodwill credit';

    /** The real customer-facing route, so the test covers what a customer calls. */
    function customerApi(service: SupportService) {
      return new SupportController(service, { logUserAction: jest.fn() } as any);
    }

    it('a customer fetching their OWN ticket does not receive internal notes', async () => {
      const { service } = makeService();
      const ticket = await seedTicket(service);
      await service.addMessage(ticket.id, 'admin-1', 'Support Team', 'admin', 'Looking into it');
      await service.addInternalNote(ticket.id, 'admin-1', 'agent@flacroncv.com', SECRET);

      const seen = await customerApi(service).getTicket(
        { uid: 'owner-1', email: 'owner-1@example.com' } as any,
        ticket.id,
      );

      expect(seen.messages.map((m) => m.content)).toEqual([
        'Something is not working',
        'Looking into it',
      ]);
      // Belt and braces: the note must not survive anywhere in the payload.
      expect(JSON.stringify(seen)).not.toContain('goodwill credit');
    });

    it('strips the internal flag from the customer-facing payload', async () => {
      const { service } = makeService();
      const ticket = await seedTicket(service);
      await service.addInternalNote(ticket.id, 'admin-1', 'agent@flacroncv.com', SECRET);

      const messages = await service.getMessages(ticket.id);

      expect(messages).toHaveLength(1);
      expect(messages[0]).not.toHaveProperty('internal');
    });

    it('keeps messages written before the flag existed visible (absent = not internal)', async () => {
      const { service, firestore } = makeService();
      const ticket = await seedTicket(service);
      // A legacy document: no `internal` field at all.
      await firestore
        .collection('support_tickets')
        .doc(ticket.id)
        .collection('messages')
        .doc('legacy-1')
        .set({
          id: 'legacy-1',
          authorId: 'owner-1',
          authorName: 'Owner',
          authorRole: 'user',
          content: 'Written before internal notes shipped',
          attachments: [],
          createdAt: new Date(),
        });

      const messages = await service.getMessages(ticket.id);

      expect(messages.map((m) => m.id)).toContain('legacy-1');
    });

    it('exposes notes to the agent-only read, in thread order', async () => {
      const { service } = makeService();
      const ticket = await seedTicket(service);
      await service.addInternalNote(ticket.id, 'admin-1', 'agent@flacroncv.com', SECRET);

      const notes = await service.getInternalNotes(ticket.id);

      expect(notes).toHaveLength(1);
      expect(notes[0]).toMatchObject({
        content: SECRET,
        authorRole: 'admin',
        authorName: 'agent@flacroncv.com',
        internal: true,
      });
    });

    it('a note is not a reply: it leaves the ticket status untouched', async () => {
      const { service } = makeService();
      const ticket = await seedTicket(service);
      expect((await service.getTicket(ticket.id)).status).toBe(TicketStatus.OPEN);

      await service.addInternalNote(ticket.id, 'admin-1', 'agent@flacroncv.com', SECRET);

      // Still OPEN — nobody outside support has seen the note, so the ticket is
      // not waiting on the customer (an admin *reply* would move it there).
      expect((await service.getTicket(ticket.id)).status).toBe(TicketStatus.OPEN);
    });

    it('a note does not clear an existing WAITING_ON_CUSTOMER status either', async () => {
      const { service } = makeService();
      const ticket = await seedTicket(service);
      await service.addMessage(ticket.id, 'admin-1', 'Support Team', 'admin', 'Any update?');
      expect((await service.getTicket(ticket.id)).status).toBe(TicketStatus.WAITING_ON_CUSTOMER);

      await service.addInternalNote(ticket.id, 'admin-1', 'agent@flacroncv.com', SECRET);

      expect((await service.getTicket(ticket.id)).status).toBe(TicketStatus.WAITING_ON_CUSTOMER);
    });

    it('bumps updatedAt so the ticket still sorts as recently worked', async () => {
      const { service } = makeService();
      const ticket = await seedTicket(service);
      const before = new Date((await service.getTicket(ticket.id)).updatedAt).getTime();

      await new Promise((resolve) => setTimeout(resolve, 5));
      await service.addInternalNote(ticket.id, 'admin-1', 'agent@flacroncv.com', SECRET);

      const after = new Date((await service.getTicket(ticket.id)).updatedAt).getTime();
      expect(after).toBeGreaterThan(before);
    });
  });
});
