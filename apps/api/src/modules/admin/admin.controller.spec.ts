import { AdminController } from './admin.controller';

const ACTOR = { uid: 'admin-1', email: 'admin@example.com', role: 'admin' } as any;

function makeController() {
  const adminService = {} as any;
  const usersService = { update: jest.fn().mockResolvedValue({ uid: 'u1', displayName: 'X' }) } as any;
  const supportService = {
    updateTicket: jest.fn().mockResolvedValue({ id: 't1' }),
    getTicket: jest.fn().mockResolvedValue({ id: 't1', userId: 'owner-1', subject: 'Help' }),
    getMessages: jest.fn().mockResolvedValue([{ id: 'm1', authorRole: 'user', content: 'hi' }]),
    addMessage: jest.fn().mockResolvedValue({ id: 'm2', authorRole: 'admin', content: 'reply' }),
  } as any;
  const audit = { log: jest.fn().mockResolvedValue(undefined) } as any;
  const controller = new AdminController(adminService, usersService, supportService, audit);
  return { controller, usersService, supportService, audit };
}

describe('AdminController audit logging', () => {
  it('logs an ADMIN_USER_UPDATED audit entry on PATCH /admin/users/:id', async () => {
    const { controller, usersService, audit } = makeController();
    const patch = { profile: { firstName: 'New' } } as any;

    const result = await controller.updateUser(ACTOR, 'u1', patch);

    expect(usersService.update).toHaveBeenCalledWith('u1', patch);
    expect(result).toEqual({ uid: 'u1', displayName: 'X' });
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'admin-1',
        actorRole: 'admin',
        action: 'ADMIN_USER_UPDATED',
        resource: 'user',
        resourceId: 'u1',
        metadata: { patch },
      }),
    );
  });

  it('logs an ADMIN_TICKET_UPDATED audit entry on PATCH /admin/tickets/:id', async () => {
    const { controller, supportService, audit } = makeController();
    const patch = { status: 'resolved' } as any;

    await controller.updateTicket(ACTOR, 't1', patch);

    expect(supportService.updateTicket).toHaveBeenCalledWith('t1', patch);
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'ADMIN_TICKET_UPDATED',
        resource: 'ticket',
        resourceId: 't1',
        actorId: 'admin-1',
      }),
    );
  });

  it('GET /admin/tickets/:id returns the ticket plus its message thread', async () => {
    const { controller, supportService } = makeController();

    const result = await controller.getTicket('t1');

    expect(supportService.getTicket).toHaveBeenCalledWith('t1');
    expect(supportService.getMessages).toHaveBeenCalledWith('t1');
    expect(result).toEqual({
      ticket: { id: 't1', userId: 'owner-1', subject: 'Help' },
      messages: [{ id: 'm1', authorRole: 'user', content: 'hi' }],
    });
  });

  it('POST /admin/tickets/:id/messages posts an admin reply and audit-logs it', async () => {
    const { controller, supportService, audit } = makeController();

    const message = await controller.replyToTicket(ACTOR, 't1', { content: 'reply' } as any);

    // Verifies the ticket exists first, then posts as an admin author.
    expect(supportService.getTicket).toHaveBeenCalledWith('t1');
    expect(supportService.addMessage).toHaveBeenCalledWith(
      't1',
      'admin-1',
      'Support Team',
      'admin',
      'reply',
    );
    expect(message).toEqual({ id: 'm2', authorRole: 'admin', content: 'reply' });
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'ADMIN_TICKET_REPLIED',
        resource: 'ticket',
        resourceId: 't1',
        actorId: 'admin-1',
        metadata: { messageId: 'm2' },
      }),
    );
  });
});
