import { ExportService } from './export.service';
import { SubscriptionPlan, SubscriptionStatus } from '@flacroncv/shared-types';

function makeUsersService(user: unknown) {
  return {
    findByIdOrThrow: jest.fn().mockResolvedValue(user),
    incrementUsage: jest.fn().mockResolvedValue(undefined),
  } as any;
}

// ExportService's constructor calls loadTemplates(), which fs-guards a missing
// template dir, so it is safe to construct with stub deps for a unit test.
function makeService(user: unknown) {
  const usersService = makeUsersService(user);
  const service = new ExportService({} as any, {} as any, {} as any, usersService, {
    assertNewConsumption: jest.fn().mockResolvedValue(undefined),
  } as any);
  return { service, usersService };
}

function makeUser(
  plan: SubscriptionPlan,
  exportsThisMonth = 0,
  status: SubscriptionStatus = SubscriptionStatus.ACTIVE,
  currentPeriodEnd: Date | null = null,
) {
  return {
    subscription: { plan, status, currentPeriodEnd },
    usage: { exportsThisMonth },
  };
}

describe('ExportService.recordClientExport (server-authorized export gate)', () => {
  it('blocks DOCX for a FREE user without incrementing usage', async () => {
    const { service, usersService } = makeService(makeUser(SubscriptionPlan.FREE));
    const result = await service.recordClientExport('uid', 'docx');
    expect(result).toEqual({ allowed: false, reason: 'docx_requires_paid' });
    expect(usersService.incrementUsage).not.toHaveBeenCalled();
  });

  it('allows a FREE PDF export under the quota and increments usage', async () => {
    const { service, usersService } = makeService(makeUser(SubscriptionPlan.FREE, 0));
    const result = await service.recordClientExport('uid', 'pdf');
    expect(result).toEqual({ allowed: true });
    expect(usersService.incrementUsage).toHaveBeenCalledWith('uid', 'exportsThisMonth');
  });

  it('blocks a FREE PDF export once the 2/month quota is reached', async () => {
    const { service, usersService } = makeService(makeUser(SubscriptionPlan.FREE, 2));
    const result = await service.recordClientExport('uid', 'pdf');
    expect(result).toEqual({ allowed: false, reason: 'limit_reached' });
    expect(usersService.incrementUsage).not.toHaveBeenCalled();
  });

  it('allows DOCX for a PRO user (paid feature + unlimited exports) and records usage', async () => {
    const { service, usersService } = makeService(makeUser(SubscriptionPlan.PRO, 999));
    const result = await service.recordClientExport('uid', 'docx');
    expect(result).toEqual({ allowed: true });
    expect(usersService.incrementUsage).toHaveBeenCalledWith('uid', 'exportsThisMonth');
  });

  it('treats a delinquent-past-grace PRO user as FREE (blocks DOCX) — ties into resolveEffectivePlan', async () => {
    const past = new Date('2000-01-01T00:00:00.000Z'); // period ended long ago
    const { service, usersService } = makeService(
      makeUser(SubscriptionPlan.PRO, 0, SubscriptionStatus.PAST_DUE, past),
    );
    const result = await service.recordClientExport('uid', 'docx');
    expect(result).toEqual({ allowed: false, reason: 'docx_requires_paid' });
    expect(usersService.incrementUsage).not.toHaveBeenCalled();
  });
});
