import { SubscriptionPlan } from '@flacroncv/shared-types';
import { ABUSE_CODE } from './abuse.exceptions';
import {
  cooldownElapsed,
  decideNewConsumption,
  grantStatusForBand,
  hasExistingUsage,
} from './abuse-grant';

const now = new Date('2026-08-18T12:00:00.000Z');

function base(overrides: Partial<Parameters<typeof decideNewConsumption>[0]> = {}) {
  return decideNewConsumption({
    enforcementOn: true,
    effectivePlan: SubscriptionPlan.FREE,
    grantStatus: 'eligible',
    cooldownEndsAt: null,
    now,
    emailVerified: true,
    emailCheckFailed: false,
    kind: 'create',
    ...overrides,
  });
}

describe('grantStatusForBand', () => {
  it('maps allow → eligible, verify → pending_step_up, deny → blocked', () => {
    expect(grantStatusForBand('allow')).toBe('eligible');
    expect(grantStatusForBand('verify')).toBe('pending_step_up');
    expect(grantStatusForBand('deny')).toBe('blocked');
  });
});

describe('decideNewConsumption', () => {
  it('allows everything when the kill switch is off', () => {
    expect(base({ enforcementOn: false, grantStatus: 'blocked', emailVerified: false }).action).toBe(
      'allow',
    );
  });

  it('allows paid plans even when blocked', () => {
    expect(base({ effectivePlan: SubscriptionPlan.PRO, grantStatus: 'blocked' }).action).toBe(
      'allow',
    );
  });

  it('denies new Free create/ai when email is unverified', () => {
    expect(base({ emailVerified: false }).code).toBe(ABUSE_CODE.EMAIL_UNVERIFIED);
    expect(base({ emailVerified: false, kind: 'ai' }).code).toBe(ABUSE_CODE.EMAIL_UNVERIFIED);
  });

  it('allows export of existing documents while unverified', () => {
    expect(base({ emailVerified: false, kind: 'export' }).action).toBe('allow');
  });

  it('skips the email gate when Auth lookup failed (fail open)', () => {
    expect(base({ emailVerified: false, emailCheckFailed: true }).action).toBe('allow');
  });

  it('grandfathers a missing grantStatus as eligible', () => {
    expect(base({ grantStatus: null }).action).toBe('allow');
    expect(base({ grantStatus: undefined }).action).toBe('allow');
  });

  it('denies blocked Free consumption', () => {
    expect(base({ grantStatus: 'blocked' }).code).toBe(ABUSE_CODE.GRANT_BLOCKED);
  });

  it('promotes pending_step_up when the cooldown has elapsed', () => {
    expect(
      base({
        grantStatus: 'pending_step_up',
        cooldownEndsAt: new Date('2026-08-18T11:00:00.000Z'),
      }).action,
    ).toBe('promote');
  });

  it('keeps pending_step_up in step-up while the cooldown is running', () => {
    expect(
      base({
        grantStatus: 'pending_step_up',
        cooldownEndsAt: new Date('2026-08-18T18:00:00.000Z'),
      }).code,
    ).toBe(ABUSE_CODE.STEP_UP);
  });

  it('treats an unreadable cooldown as elapsed (fail open)', () => {
    expect(cooldownElapsed('not-a-date', now)).toBe(true);
    expect(cooldownElapsed(null, now)).toBe(true);
  });
});

describe('hasExistingUsage', () => {
  it('is true when any counter is already above zero', () => {
    expect(hasExistingUsage({ cvsCreated: 1 })).toBe(true);
    expect(hasExistingUsage({ coverLettersCreated: 0, aiCreditsUsed: 0, exportsThisMonth: 0 })).toBe(
      false,
    );
  });
});
