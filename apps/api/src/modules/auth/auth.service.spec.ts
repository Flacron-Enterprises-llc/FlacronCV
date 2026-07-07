import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { FirebaseAdminService } from '../firebase/firebase-admin.service';
import { UsersService } from '../users/users.service';
import { MailService } from '../mail/mail.service';
import { createMockFirebaseAdmin } from '../../test-utils/mock-firebase-admin';
import { InMemoryFirestore } from '../firebase/in-memory-firestore';

describe('AuthService', () => {
  let service: AuthService;
  let mockFirebaseAdmin: ReturnType<typeof createMockFirebaseAdmin>;
  let mockUsersService: {
    findById: jest.Mock;
    create: jest.Mock;
    updateLastLogin: jest.Mock;
  };
  let mockMailService: {
    sendWelcomeEmail: jest.Mock;
    sendPasswordResetEmail: jest.Mock;
    sendEmailVerificationEmail: jest.Mock;
  };

  beforeEach(async () => {
    mockFirebaseAdmin = createMockFirebaseAdmin();

    mockUsersService = {
      findById: jest.fn(),
      create: jest.fn(),
      updateLastLogin: jest.fn().mockResolvedValue(undefined),
    };

    mockMailService = {
      sendWelcomeEmail: jest.fn().mockResolvedValue(undefined),
      sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
      sendEmailVerificationEmail: jest.fn().mockResolvedValue(undefined),
    };

    const mockConfigService = {
      get: jest.fn().mockReturnValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: FirebaseAdminService, useValue: mockFirebaseAdmin },
        { provide: UsersService, useValue: mockUsersService },
        { provide: MailService, useValue: mockMailService },
        { provide: ConfigService, useValue: mockConfigService },
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
        expect.any(Object),
      );
      expect(mockMailService.sendEmailVerificationEmail).toHaveBeenCalledWith(
        'verify@example.com',
        'Verify User',
        'https://verify.link',
      );
    });
  });
});
