import { BadRequestException } from '@nestjs/common';
import { ContactService } from './contact.service';

function makeMail() {
  return { sendContactMessage: jest.fn().mockResolvedValue(undefined) } as any;
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
  let service: ContactService;

  beforeEach(() => {
    mail = makeMail();
    service = new ContactService(mail);
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
});
