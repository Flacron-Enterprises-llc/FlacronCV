import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { CONTACT_MESSAGES_COLLECTION, ContactService } from './contact.service';

function makeMail() {
  return { sendContactMessage: jest.fn().mockResolvedValue(undefined) } as any;
}

/** A Firestore stand-in that records every write to contact_messages. */
function makeFirebase() {
  const docs = new Map<string, Record<string, unknown>>();
  const set = jest.fn(async (id: string, data: Record<string, unknown>) => {
    docs.set(id, { ...data });
  });
  const update = jest.fn(async (id: string, data: Record<string, unknown>) => {
    docs.set(id, { ...(docs.get(id) ?? {}), ...data });
  });
  const collection = jest.fn((name: string) => {
    expect(name).toBe(CONTACT_MESSAGES_COLLECTION);
    return {
      doc: (id: string) => ({
        set: (data: Record<string, unknown>) => set(id, data),
        update: (data: Record<string, unknown>) => update(id, data),
      }),
    };
  });
  return { firebase: { firestore: { collection } } as any, docs, set, update };
}

const VALID = {
  name: 'Jane Doe',
  email: 'jane@example.com',
  subject: 'Hello',
  category: 'billing',
  message: 'I have a question about my plan.',
};

describe('ContactService', () => {
  let mail: ReturnType<typeof makeMail>;
  let store: ReturnType<typeof makeFirebase>;
  let service: ContactService;

  beforeEach(() => {
    mail = makeMail();
    store = makeFirebase();
    service = new ContactService(mail, store.firebase);
  });

  it('sends a valid submission (trimmed) and returns { ok: true }', async () => {
    const result = await service.submit({
      ...VALID,
      name: '  Jane Doe  ',
      message: '  I have a question about my plan.  ',
    });
    expect(result).toEqual({ ok: true });
    expect(mail.sendContactMessage).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Jane Doe', message: 'I have a question about my plan.', category: 'billing' }),
    );
  });

  it('coerces an unknown category to "general"', async () => {
    await service.submit({ ...VALID, category: 'hacker' });
    expect(mail.sendContactMessage).toHaveBeenCalledWith(
      expect.objectContaining({ category: 'general' }),
    );
  });

  it('rejects an empty/whitespace name', async () => {
    await expect(service.submit({ ...VALID, name: '   ' })).rejects.toThrow(BadRequestException);
    expect(mail.sendContactMessage).not.toHaveBeenCalled();
  });

  it('rejects an invalid email', async () => {
    await expect(service.submit({ ...VALID, email: 'not-an-email' })).rejects.toThrow(BadRequestException);
    expect(mail.sendContactMessage).not.toHaveBeenCalled();
  });

  it('rejects a missing message', async () => {
    await expect(service.submit({ ...VALID, message: undefined })).rejects.toThrow(BadRequestException);
  });

  it('rejects an over-length message (>5000 chars)', async () => {
    await expect(service.submit({ ...VALID, message: 'x'.repeat(5001) })).rejects.toThrow(BadRequestException);
  });

  it('accepts a current 26-option category', async () => {
    await service.submit({ ...VALID, category: 'privacy_request' });
    expect(mail.sendContactMessage).toHaveBeenCalledWith(
      expect.objectContaining({ category: 'privacy_request' }),
    );
  });

  it('forwards optional account fields and stamps a timestamp', async () => {
    await service.submit({
      ...VALID,
      accountEmail: 'acct@example.com',
      plan: 'pro',
      userId: 'uid-1',
      timestamp: '2026-08-16T12:00:00.000Z',
    });
    expect(mail.sendContactMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        accountEmail: 'acct@example.com',
        plan: 'pro',
        userId: 'uid-1',
        timestamp: '2026-08-16T12:00:00.000Z',
      }),
    );
  });

  it('drops a malformed optional account email rather than rejecting the message', async () => {
    await service.submit({ ...VALID, accountEmail: 'not-an-email' });
    expect(mail.sendContactMessage).toHaveBeenCalledWith(
      expect.objectContaining({ accountEmail: undefined }),
    );
  });

  describe('persistence', () => {
    it('stores the message before notifying, then marks it notified', async () => {
      await service.submit(VALID);
      expect(store.set).toHaveBeenCalledTimes(1);
      expect(store.set.mock.invocationCallOrder[0]).toBeLessThan(mail.sendContactMessage.mock.invocationCallOrder[0]);
      const [doc] = [...store.docs.values()];
      expect(doc).toEqual(
        expect.objectContaining({
          name: 'Jane Doe',
          email: 'jane@example.com',
          subject: 'Hello',
          category: 'billing',
          message: 'I have a question about my plan.',
          status: 'notified',
          createdAt: expect.any(Date),
        }),
      );
      // Firestore rejects undefined: absent optional fields are omitted, not undefined.
      expect(Object.values(store.set.mock.calls[0][1])).not.toContain(undefined);
    });

    it('still succeeds, and keeps the message, when the email notification fails', async () => {
      mail.sendContactMessage.mockRejectedValue(new Error('SES down'));
      await expect(service.submit(VALID)).resolves.toEqual({ ok: true });
      const [doc] = [...store.docs.values()];
      expect(doc).toEqual(expect.objectContaining({ status: 'notify_failed', message: 'I have a question about my plan.' }));
    });

    it('still succeeds when storage fails but the email goes out', async () => {
      store.set.mockRejectedValueOnce(new Error('firestore down'));
      await expect(service.submit(VALID)).resolves.toEqual({ ok: true });
      expect(mail.sendContactMessage).toHaveBeenCalledTimes(1);
      expect(store.update).not.toHaveBeenCalled();
    });

    it('fails with 503 only when the message could be neither stored nor emailed', async () => {
      store.set.mockRejectedValueOnce(new Error('firestore down'));
      mail.sendContactMessage.mockRejectedValue(new Error('SES down'));
      await expect(service.submit(VALID)).rejects.toThrow(ServiceUnavailableException);
    });

    it('stores nothing for an invalid submission', async () => {
      await expect(service.submit({ ...VALID, email: 'jane@localhost' })).rejects.toThrow(BadRequestException);
      expect(store.set).not.toHaveBeenCalled();
    });
  });
});
