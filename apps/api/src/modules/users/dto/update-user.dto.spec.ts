import { BadRequestException } from '@nestjs/common';
import { Locale, Theme } from '@flacroncv/shared-types';
import { transformBody } from '../../../common/test/app-validation-pipe';
import { UpdatePreferencesDto, UpdateUserDto } from './update-user.dto';

async function expectReject(cls: new () => object, payload: unknown) {
  await expect(transformBody(cls, payload)).rejects.toBeInstanceOf(BadRequestException);
}

describe('User write DTOs (ValidationPipe)', () => {
  it('accepts a profile update', async () => {
    const result = await transformBody(UpdateUserDto, {
      profile: { firstName: 'Ada', lastName: 'Lovelace', headline: 'Engineer' },
    });
    expect(result.profile?.firstName).toBe('Ada');
  });

  it('accepts photoURL null', async () => {
    const result = await transformBody(UpdateUserDto, { photoURL: null });
    expect(result.photoURL).toBeNull();
  });

  it('accepts a preferences patch', async () => {
    const result = await transformBody(UpdatePreferencesDto, {
      language: Locale.EN,
      theme: Theme.DARK,
      emailNotifications: true,
      marketingEmails: false,
    });
    expect(result.language).toBe(Locale.EN);
    expect(result.theme).toBe(Theme.DARK);
  });

  it('rejects unknown top-level and nested keys', async () => {
    await expectReject(UpdateUserDto, { role: 'admin' });
    await expectReject(UpdateUserDto, { profile: { firstName: 'Ada', twitter: 'x' } });
    await expectReject(UpdatePreferencesDto, { language: Locale.EN, role: 'admin' });
  });

  it('rejects a malformed preference', async () => {
    await expectReject(UpdatePreferencesDto, { language: 'xx' });
  });
});
