import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { FirebaseAdminService } from '../firebase/firebase-admin.service';
import { UsersService } from '../users/users.service';
import { MailService } from '../mail/mail.service';
import { AuditService } from '../audit/audit.service';
import { AbuseService } from '../abuse/abuse.service';
import { createMockFirebaseAdmin } from '../../test-utils/mock-firebase-admin';
import { InMemoryFirestore } from '../firebase/in-memory-firestore';

/** Sign-in/out, registration and role changes are audit-logged; spy on them. */
function makeMockAudit() {
  return {
    log: jest.fn().mockResolvedValue(undefined),
    logUserAction: jest.fn().mockResolvedValue(undefined),
    logSystemAction: jest.fn().mockResolvedValue(undefined),
  };
}

describe('AuthService', () => {
  let mockAudit: ReturnType<typeof makeMockAudit>;
  let service: AuthService;
  let mockFirebaseAdmin: ReturnType<typeof createMockFirebaseAdmin>;
  let mockUsersService: {
    findById: jest.Mock;
    create: jest.Mock;
    updateLastLogin: jest.Mock;
    updateRole: jest.Mock;
  };
  let mockMailService: {
    sendWelcomeEmail: jest.Mock;
    sendPasswordResetEmail: jest.Mock;
    sendEmailVerificationEmail: jest.Mock;
  };
  let mockConfigService: { get: jest.Mock };
  let mockAbuse: { recordRegistrationSignals: jest.Mock; assertNetworkCreateAllowed: jest.Mock };

  beforeEach(async () => {
    mockFirebaseAdmin = createMockFirebaseAdmin();

    mockUsersService = {
      findById: jest.fn(),
      create: jest.fn(),
      updateLastLogin: jest.fn().mockResolvedValue(undefined),
      updateRole: jest.fn().mockResolvedValue(undefined),
    };

    mockMailService = {
      sendWelcomeEmail: jest.fn().mockResolvedValue(undefined),
      sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
      sendEmailVerificationEmail: jest.fn().mockResolvedValue(undefined),
    };

    mockConfigService = {
      get: jest.fn((key: string) => (key === 'frontendUrl' ? 'https://app.example.com' : undefined)),
    };

    mockAudit = makeMockAudit();
    mockAbuse = {
      recordRegistrationSignals: jest.fn().mockResolvedValue(undefined),
      assertNetworkCreateAllowed: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: FirebaseAdminService, useValue: mockFirebaseAdmin },
        { provide: UsersService, useValue: mockUsersService },
        { provide: MailService, useValue: mockMailService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: AuditService, useValue: mockAudit },
        { provide: AbuseService, useValue: mockAbuse },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  describe('verifyAndSync', () => {
    it('creates new user and sends welcome email when emailVerified=true (OAuth)', async () => {
      const uid = 'new-uid-1';
      const email = 'oauth@example.com';
      const displayName = 'OAuth User';
      const createdUser = { uid, email, displayName };

      mockUsersService.findById!.mockResolvedValue(null);
      mockUsersService.create!.mockResolvedValue(createdUser as any);

      // Pre-seed a doc so ref.update works
      await (mockFirebaseAdmin.firestore as InMemoryFirestore)
        .collection('users')
        .doc(uid)
        .set({ uid, welcomeEmailSent: false });

      const result = await service.verifyAndSync(uid, email, displayName, true);

      expect(mockUsersService.create).toHaveBeenCalledWith(
        expect.objectContaining({ uid, email, displayName }),
      );
      expect(result).toEqual(createdUser);
      // welcome email is called async (fire-and-forget), wait a tick
      await new Promise((r) => setTimeout(r, 10));
      expect(mockMailService.sendWelcomeEmail).toHaveBeenCalledWith(email, displayName);
    });

    it('creates new user and sends verification email when emailVerified=false (password signup)', async () => {
      const uid = 'new-uid-2';
      const email = 'pass@example.com';
      const displayName = 'Password User';
      const createdUser = { uid, email, displayName };

      mockUsersService.findById!.mockResolvedValue(null);
      mockUsersService.create!.mockResolvedValue(createdUser as any);
      mockFirebaseAdmin.auth.generateEmailVerificationLink.mockResolvedValue('https://verify.link');

      await (mockFirebaseAdmin.firestore as InMemoryFirestore)
        .collection('users')
        .doc(uid)
        .set({ uid, welcomeEmailSent: false });

      await service.verifyAndSync(uid, email, displayName, false);

      expect(mockUsersService.create).toHaveBeenCalled();
      await new Promise((r) => setTimeout(r, 10));
      expect(mockMailService.sendWelcomeEmail).not.toHaveBeenCalled();
      expect(mockMailService.sendEmailVerificationEmail).toHaveBeenCalledWith(
        email,
        displayName,
        'https://verify.link',
      );
    });

    it('updates lastLogin for a returning user', async () => {
      const uid = 'existing-uid';
      const existingUser = { uid, email: 'existing@example.com', displayName: 'Existing' };

      mockUsersService.findById!.mockResolvedValue(existingUser as any);

      // Returning user with verified email + welcomeEmailSent already true → no welcome email
      await (mockFirebaseAdmin.firestore as InMemoryFirestore)
        .collection('users')
        .doc(uid)
        .set({ uid, welcomeEmailSent: true });

      await service.verifyAndSync(uid, existingUser.email, existingUser.displayName, true);

      expect(mockUsersService.updateLastLogin).toHaveBeenCalledWith(uid);
      expect(mockUsersService.create).not.toHaveBeenCalled();
    });

    it('resolves a missing display name from the Auth record on signup', async () => {
      const uid = 'no-claim-uid';
      const email = 'named@example.com';

      mockUsersService.findById!.mockResolvedValue(null);
      mockUsersService.create!.mockImplementation(async (d: any) => d);
      mockFirebaseAdmin.auth.getUser.mockResolvedValue({ displayName: 'Real Name' } as any);
      mockFirebaseAdmin.auth.generateEmailVerificationLink.mockResolvedValue('https://verify.link');

      await (mockFirebaseAdmin.firestore as InMemoryFirestore)
        .collection('users').doc(uid).set({ uid });

      await service.verifyAndSync(uid, email, '', false);

      expect(mockFirebaseAdmin.auth.getUser).toHaveBeenCalledWith(uid);
      expect(mockUsersService.create).toHaveBeenCalledWith(
        expect.objectContaining({ displayName: 'Real Name' }),
      );
    });

    it('falls back to the email prefix and marks the name pending when no name exists yet', async () => {
      const uid = 'pending-uid';
      const email = 'jane.doe@example.com';

      mockUsersService.findById!.mockResolvedValue(null);
      mockUsersService.create!.mockImplementation(async (d: any) => d);
      mockFirebaseAdmin.auth.getUser.mockResolvedValue({ displayName: undefined } as any);
      mockFirebaseAdmin.auth.generateEmailVerificationLink.mockResolvedValue('https://verify.link');

      const store = mockFirebaseAdmin.firestore as InMemoryFirestore;
      await store.collection('users').doc(uid).set({ uid });

      await service.verifyAndSync(uid, email, '', false);

      expect(mockUsersService.create).toHaveBeenCalledWith(
        expect.objectContaining({ displayName: 'jane.doe' }),
      );
      const doc = await store.collection('users').doc(uid).get();
      expect(doc.data()?.displayNamePending).toBe(true);
    });

    it('heals a pending placeholder name on a later sync', async () => {
      const uid = 'heal-uid';
      const email = 'heal@example.com';
      mockUsersService.findById!.mockResolvedValue({ uid, email, displayName: 'heal' } as any);
      mockFirebaseAdmin.auth.getUser.mockResolvedValue({ displayName: 'Healed Name' } as any);

      const store = mockFirebaseAdmin.firestore as InMemoryFirestore;
      await store.collection('users').doc(uid).set({ uid, displayNamePending: true, welcomeEmailSent: true });

      const result = await service.verifyAndSync(uid, email, '', false);

      expect(result.displayName).toBe('Healed Name');
      const doc = await store.collection('users').doc(uid).get();
      expect(doc.data()?.displayName).toBe('Healed Name');
      expect(doc.data()?.displayNamePending).toBe(false);
    });

    it('never rewrites the name when displayNamePending is not set', async () => {
      const uid = 'settled-uid';
      const email = 'settled@example.com';
      mockUsersService.findById!.mockResolvedValue({ uid, email, displayName: 'Chosen Name' } as any);

      const store = mockFirebaseAdmin.firestore as InMemoryFirestore;
      await store.collection('users').doc(uid).set({ uid, displayName: 'Chosen Name', welcomeEmailSent: true });

      const result = await service.verifyAndSync(uid, email, '', true);

      expect(mockFirebaseAdmin.auth.getUser).not.toHaveBeenCalled();
      expect(result.displayName).toBe('Chosen Name');
    });
  });

  describe('sendPasswordReset', () => {
    it('calls generatePasswordResetLink and sends reset email', async () => {
      const email = 'reset@example.com';
      mockFirebaseAdmin.auth.generatePasswordResetLink.mockResolvedValue('https://reset.link');

      await service.sendPasswordReset(email);

      expect(mockFirebaseAdmin.auth.generatePasswordResetLink).toHaveBeenCalledWith(email);
      expect(mockMailService.sendPasswordResetEmail).toHaveBeenCalledWith(
        email,
        expect.any(String),
        'https://reset.link',
      );
    });

    it('silently succeeds for unknown emails so account existence never leaks', async () => {
      const err = Object.assign(new Error('no user'), { code: 'auth/email-not-found' });
      mockFirebaseAdmin.auth.generatePasswordResetLink.mockRejectedValue(err);

      await expect(service.sendPasswordReset('ghost@example.com')).resolves.toBeUndefined();
      expect(mockMailService.sendPasswordResetEmail).not.toHaveBeenCalled();
    });

    it('rethrows unexpected errors', async () => {
      const err = Object.assign(new Error('boom'), { code: 'auth/internal-error' });
      mockFirebaseAdmin.auth.generatePasswordResetLink.mockRejectedValue(err);

      await expect(service.sendPasswordReset('reset@example.com')).rejects.toThrow('boom');
    });
  });

  describe('sendEmailVerification', () => {
    it('calls generateEmailVerificationLink and sends verification email', async () => {
      const uid = 'uid-verify';
      mockFirebaseAdmin.auth.getUser.mockResolvedValue({
        email: 'verify@example.com',
        displayName: 'Verify User',
      } as any);
      mockFirebaseAdmin.auth.generateEmailVerificationLink.mockResolvedValue('https://verify.link');

      await service.sendEmailVerification(uid);

      expect(mockFirebaseAdmin.auth.generateEmailVerificationLink).toHaveBeenCalledWith(
        'verify@example.com',
        { url: 'https://app.example.com/dashboard' },
      );
      expect(mockMailService.sendEmailVerificationEmail).toHaveBeenCalledWith(
        'verify@example.com',
        'Verify User',
        'https://verify.link',
      );
    });

    /**
     * The production failure this guards: FRONTEND_URL pointed at a domain that
     * was not on the Firebase authorized-domains list, so every link request
     * threw. Signup swallows that error and the resend endpoint returned a bare
     * 500, leaving the account unable to verify by any route.
     */
    it.each([
      'auth/unauthorized-continue-uri',
      'auth/invalid-continue-uri',
      'auth/missing-continue-uri',
      'auth/invalid-dynamic-link-domain',
    ])('retries without a continue URL when Firebase rejects it with %s', async (code) => {
      mockFirebaseAdmin.auth.getUser.mockResolvedValue({
        email: 'verify@example.com',
        displayName: 'Verify User',
      } as any);
      mockFirebaseAdmin.auth.generateEmailVerificationLink
        .mockRejectedValueOnce(Object.assign(new Error('rejected'), { code }))
        .mockResolvedValueOnce('https://fallback.link');

      await service.sendEmailVerification('uid-verify');

      expect(mockFirebaseAdmin.auth.generateEmailVerificationLink).toHaveBeenNthCalledWith(
        2,
        'verify@example.com',
      );
      expect(mockMailService.sendEmailVerificationEmail).toHaveBeenCalledWith(
        'verify@example.com',
        'Verify User',
        'https://fallback.link',
      );
    });

    it('rethrows errors that are not about the continue URL', async () => {
      mockFirebaseAdmin.auth.getUser.mockResolvedValue({
        email: 'verify@example.com',
        displayName: 'Verify User',
      } as any);
      mockFirebaseAdmin.auth.generateEmailVerificationLink.mockRejectedValue(
        Object.assign(new Error('boom'), { code: 'auth/internal-error' }),
      );

      await expect(service.sendEmailVerification('uid-verify')).rejects.toThrow('boom');
      expect(mockFirebaseAdmin.auth.generateEmailVerificationLink).toHaveBeenCalledTimes(1);
      expect(mockMailService.sendEmailVerificationEmail).not.toHaveBeenCalled();
    });

    // A relative or scheme-less FRONTEND_URL would be rejected by Firebase, so
    // it is never sent in the first place.
    it('omits an unusable continue URL instead of sending it to Firebase', async () => {
      mockConfigService.get.mockImplementation((key: string) =>
        key === 'frontendUrl' ? 'app.example.com' : undefined,
      );
      mockFirebaseAdmin.auth.getUser.mockResolvedValue({
        email: 'verify@example.com',
        displayName: 'Verify User',
      } as any);
      mockFirebaseAdmin.auth.generateEmailVerificationLink.mockResolvedValue('https://verify.link');

      await service.sendEmailVerification('uid-verify');

      expect(mockFirebaseAdmin.auth.generateEmailVerificationLink).toHaveBeenCalledWith(
        'verify@example.com',
      );
    });

    it('rejects an account with no email address instead of failing inside Firebase', async () => {
      mockFirebaseAdmin.auth.getUser.mockResolvedValue({ email: undefined } as any);

      await expect(service.sendEmailVerification('uid-verify')).rejects.toThrow(BadRequestException);
      expect(mockFirebaseAdmin.auth.generateEmailVerificationLink).not.toHaveBeenCalled();
    });
  });

  /**
   * The admin Audit Logs page reported "No audit logs found" on a live system
   * because authentication was never recorded — Firebase Auth runs in the
   * browser, so `/auth/verify` is the only point at which the backend learns a
   * sign-in happened.
   */
  describe('audit trail', () => {
    it('records a sign-in for a returning user', async () => {
      await (mockFirebaseAdmin.firestore as InMemoryFirestore)
        .collection('users')
        .doc('u1')
        .set({ uid: 'u1', welcomeEmailSent: true });
      mockUsersService.findById.mockResolvedValue({ uid: 'u1', displayName: 'A', role: 'user' });

      await service.verifyAndSync('u1', 'a@example.com', 'A', true, undefined, {
        ipAddress: '203.0.113.7',
        userAgent: 'jest',
      });

      expect(mockAudit.logUserAction).toHaveBeenCalledWith(
        'AUTH_LOGIN',
        expect.objectContaining({ uid: 'u1', email: 'a@example.com' }),
        'user',
        'u1',
        expect.objectContaining({ ipAddress: '203.0.113.7', userAgent: 'jest' }),
      );
    });

    it('does NOT record a sign-in when the last sync was recent (page load, not a new session)', async () => {
      // `/auth/verify` fires on every mount of the authenticated app. Logging
      // unconditionally buried every genuine event under navigation noise —
      // the admin page reads a bounded window, so real events fell out of it.
      await (mockFirebaseAdmin.firestore as InMemoryFirestore)
        .collection('users')
        .doc('u1')
        .set({ uid: 'u1', welcomeEmailSent: true });
      mockUsersService.findById.mockResolvedValue({
        uid: 'u1',
        displayName: 'A',
        role: 'user',
        lastLoginAt: new Date(Date.now() - 60_000), // one minute ago
      });

      await service.verifyAndSync('u1', 'a@example.com', 'A', true);

      const loginCalls = mockAudit.logUserAction.mock.calls.filter((c) => c[0] === 'AUTH_LOGIN');
      expect(loginCalls).toHaveLength(0);
      // The session itself is still tracked.
      expect(mockUsersService.updateLastLogin).toHaveBeenCalledWith('u1');
    });

    it('records a sign-in again once the session gap has elapsed', async () => {
      await (mockFirebaseAdmin.firestore as InMemoryFirestore)
        .collection('users')
        .doc('u2')
        .set({ uid: 'u2', welcomeEmailSent: true });
      mockUsersService.findById.mockResolvedValue({
        uid: 'u2',
        displayName: 'B',
        role: 'user',
        lastLoginAt: new Date(Date.now() - 2 * 60 * 60 * 1000), // two hours ago
      });

      await service.verifyAndSync('u2', 'b@example.com', 'B', true);

      const loginCalls = mockAudit.logUserAction.mock.calls.filter((c) => c[0] === 'AUTH_LOGIN');
      expect(loginCalls).toHaveLength(1);
    });

    it('records a registration for a brand-new user', async () => {
      mockUsersService.findById.mockResolvedValue(null);
      mockUsersService.create.mockResolvedValue({ uid: 'new1', displayName: 'New' } as any);
      // Pre-seed the doc so the service's ref.update() calls resolve, matching
      // the other new-user tests above.
      await (mockFirebaseAdmin.firestore as InMemoryFirestore)
        .collection('users')
        .doc('new1')
        .set({ uid: 'new1', welcomeEmailSent: false });

      await service.verifyAndSync('new1', 'new@example.com', 'New', true);

      expect(mockAudit.logUserAction).toHaveBeenCalledWith(
        'AUTH_REGISTERED',
        expect.objectContaining({ uid: 'new1' }),
        'user',
        'new1',
        expect.anything(),
      );
    });

    it('scores a new registration and never puts the device token on the audit row', async () => {
      mockUsersService.findById.mockResolvedValue(null);
      mockUsersService.create.mockResolvedValue({ uid: 'new2', displayName: 'New' } as any);
      await (mockFirebaseAdmin.firestore as InMemoryFirestore)
        .collection('users')
        .doc('new2')
        .set({ uid: 'new2', welcomeEmailSent: false });

      const deviceToken = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
      await service.verifyAndSync(
        'new2',
        'new2@example.com',
        'New',
        true,
        undefined,
        { ipAddress: '203.0.113.7', userAgent: 'jest' },
        deviceToken,
      );

      expect(mockAbuse.recordRegistrationSignals).toHaveBeenCalledWith(
        expect.objectContaining({
          uid: 'new2',
          deviceToken,
          ipAddress: '203.0.113.7',
        }),
      );
      const registered = mockAudit.logUserAction.mock.calls.find((c) => c[0] === 'AUTH_REGISTERED');
      expect(JSON.stringify(registered)).not.toContain(deviceToken);
    });

    it('still creates the user when scoring throws', async () => {
      mockUsersService.findById.mockResolvedValue(null);
      mockUsersService.create.mockResolvedValue({ uid: 'new3', displayName: 'New' } as any);
      mockAbuse.recordRegistrationSignals.mockRejectedValueOnce(new Error('scoring down'));
      await (mockFirebaseAdmin.firestore as InMemoryFirestore)
        .collection('users')
        .doc('new3')
        .set({ uid: 'new3', welcomeEmailSent: false });

      const result = await service.verifyAndSync('new3', 'new3@example.com', 'New', true);
      expect(result.uid).toBe('new3');
      expect(mockUsersService.create).toHaveBeenCalled();
    });

    it('records a sign-out', async () => {
      await service.recordLogout({ uid: 'u1', email: 'a@example.com', role: 'user' });

      expect(mockAudit.logUserAction).toHaveBeenCalledWith(
        'AUTH_LOGOUT',
        expect.objectContaining({ uid: 'u1' }),
        'user',
        'u1',
        expect.anything(),
      );
    });

    it('records a failed sign-in without storing any credential', async () => {
      await service.recordFailedLogin('bad@example.com', 'auth/wrong-password', {
        ipAddress: '203.0.113.9',
      });

      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'AUTH_LOGIN_FAILED',
          actorEmail: 'bad@example.com',
          actorRole: 'anonymous',
          metadata: { reason: 'auth/wrong-password' },
        }),
      );
      const entry = mockAudit.log.mock.calls[0][0];
      expect(JSON.stringify(entry)).not.toMatch(/password["\s]*:/i);
    });

    it('records a role change with the actor and the before/after values', async () => {
      mockUsersService.findById.mockResolvedValue({ uid: 'target', role: 'user' });

      await service.setUserRole('target', 'admin' as any, {
        uid: 'boss',
        email: 'boss@example.com',
        role: 'super_admin',
      });

      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'USER_ROLE_CHANGED',
          actorId: 'boss',
          actorRole: 'super_admin',
          resourceId: 'target',
          changes: { before: { role: 'user' }, after: { role: 'admin' } },
        }),
      );
    });
  });
});
