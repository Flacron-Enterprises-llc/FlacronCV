import { BadRequestException } from '@nestjs/common';
import { transformBody } from '../../../common/test/app-validation-pipe';
import { ContactMessageDto } from './contact-message.dto';

async function expectReject(cls: new () => object, payload: unknown) {
  await expect(transformBody(cls, payload)).rejects.toBeInstanceOf(BadRequestException);
}

describe('ContactMessageDto (ValidationPipe)', () => {
  it('accepts the public contact form payload', async () => {
    const result = await transformBody(ContactMessageDto, {
      name: 'Ada',
      email: 'ada@example.com',
      subject: 'Account support',
      category: 'account_support',
      message: 'I cannot sign in.',
      accountEmail: 'ada@example.com',
      plan: 'pro',
      userId: 'uid-1',
      timestamp: '2026-08-19T00:00:00.000Z',
    });
    expect(result.email).toBe('ada@example.com');
  });

  it('rejects unknown fields and a bad email', async () => {
    await expectReject(ContactMessageDto, {
      name: 'Ada',
      email: 'ada@example.com',
      subject: 'Hi',
      message: 'Hello',
      extra: true,
    });
    await expectReject(ContactMessageDto, {
      name: 'Ada',
      email: 'not-an-email',
      subject: 'Hi',
      message: 'Hello',
    });
  });
});
