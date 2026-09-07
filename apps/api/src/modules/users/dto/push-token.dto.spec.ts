import { BadRequestException } from '@nestjs/common';
import { transformBody } from '../../../common/test/app-validation-pipe';
import { PushTokenDto } from './push-token.dto';

const VALID = 'ExponentPushToken[FlacronCVTestToken0001]';

describe('PushTokenDto (ValidationPipe)', () => {
  it('accepts an Expo push token', async () => {
    const result = await transformBody(PushTokenDto, { token: VALID });
    expect(result.token).toBe(VALID);
  });

  it('rejects a missing or malformed token', async () => {
    await expect(transformBody(PushTokenDto, {})).rejects.toBeInstanceOf(BadRequestException);
    await expect(transformBody(PushTokenDto, { token: 'not-a-token' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(transformBody(PushTokenDto, { token: VALID, extra: true })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
