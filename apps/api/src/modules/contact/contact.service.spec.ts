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
});
