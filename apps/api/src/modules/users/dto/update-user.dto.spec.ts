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
      pushNotifications: false,
    });
    expect(result.language).toBe(Locale.EN);
    expect(result.theme).toBe(Theme.DARK);
    expect(result.pushNotifications).toBe(false);
  });

  it('rejects a blank or whitespace-only name, and still accepts a name that was omitted', async () => {
    await expectReject(UpdateUserDto, { profile: { firstName: '   ', lastName: 'Lovelace' } });
    await expectReject(UpdateUserDto, { profile: { firstName: 'Ada', lastName: '' } });
    const result = await transformBody(UpdateUserDto, { profile: { headline: 'Engineer' } });
    expect(result.profile?.headline).toBe('Engineer');
    expect(result.profile?.firstName).toBeUndefined();
    expect(result.profile?.lastName).toBeUndefined();
  });

  it('rejects unknown top-level and nested keys', async () => {
    await expectReject(UpdateUserDto, { role: 'admin' });
    await expectReject(UpdateUserDto, { profile: { firstName: 'Ada', twitter: 'x' } });
    await expectReject(UpdatePreferencesDto, { language: Locale.EN, role: 'admin' });
  });

  it('rejects a malformed preference', async () => {
    await expectReject(UpdatePreferencesDto, { language: 'xx' });
  });

  it('accepts an app tour record and rejects a bad one', async () => {
    const result = await transformBody(UpdatePreferencesDto, {
      appTour: {
        version: 1,
        status: 'in_progress',
        stepId: 'welcome',
        completedAt: null,
        skippedAt: null,
        updatedAt: '2026-10-20T12:00:00.000Z',
      },
    });
    expect(result.appTour?.status).toBe('in_progress');
    expect(result.appTour?.stepId).toBe('welcome');

    await expectReject(UpdatePreferencesDto, {
      appTour: { version: 1, status: 'finished', stepId: null },
    });
    await expectReject(UpdatePreferencesDto, {
      appTour: { version: 1, status: 'skipped', stepId: 'Welcome' },
    });
  });
});
