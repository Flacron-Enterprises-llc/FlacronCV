import { Logger } from '@nestjs/common';
import { AbuseService } from './abuse.service';
import { InMemoryFirestore } from '../firebase/in-memory-firestore';
import { ABUSE_DEVICES_COLLECTION, ABUSE_NETWORKS_COLLECTION } from './abuse.constants';

const BROWSER =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0.0.0';

function makeService(
  secret: string | undefined,
  firestore: InMemoryFirestore,
  auth: { getUser: jest.Mock } = { getUser: jest.fn().mockResolvedValue({ emailVerified: true }) },
) {
  const config = {
    get: jest.fn((key: string) => (key === 'abuseHmacSecret' ? secret : undefined)),
  };
  return new AbuseService({ firestore, auth } as any, config as any);
}

async function seedUser(firestore: InMemoryFirestore, uid: string) {
  await firestore.collection('users').doc(uid).set({ uid, email: `${uid}@example.com` });
}

describe('AbuseService.recordRegistrationSignals', () => {
  let firestore: InMemoryFirestore;
  let warn: jest.SpyInstance;
  let log: jest.SpyInstance;

  beforeEach(() => {
    firestore = new InMemoryFirestore();
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    log = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    warn.mockRestore();
    log.mockRestore();
  });

  it('fails soft when ABUSE_HMAC_SECRET is missing: user stays, scoring skipped, no hashes written', async () => {
    await seedUser(firestore, 'u-new');
    const service = makeService(undefined, firestore);

    await expect(
      service.recordRegistrationSignals({
        uid: 'u-new',
        email: 'person@example.com',
        ipAddress: '203.0.113.10',
        userAgent: BROWSER,
        deviceToken: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      }),
    ).resolves.toBeUndefined();

    const user = (await firestore.collection('users').doc('u-new').get()).data();
    expect(user).toBeDefined();
    expect(user!.abuse).toBeUndefined();

    const devices = await firestore.collection(ABUSE_DEVICES_COLLECTION).get();
    const networks = await firestore.collection(ABUSE_NETWORKS_COLLECTION).get();
    expect(devices.size).toBe(0);
    expect(networks.size).toBe(0);

    expect(warn).toHaveBeenCalledWith('Abuse HMAC secret is not configured; scoring skipped');
    const printed = [...warn.mock.calls, ...log.mock.calls].flat().join(' ');
    expect(printed).not.toContain('203.0.113.10');
    expect(printed).not.toContain('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
    expect(printed).not.toContain('person@example.com');
  });

  it('three accounts from one IP on three devices are all allow (client §4)', async () => {
    const service = makeService('unit-test-hmac-secret', firestore);
    const sharedIp = '203.0.113.50';
    const accounts = [
      { uid: 'house-a', token: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' },
      { uid: 'house-b', token: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' },
      { uid: 'house-c', token: 'cccccccccccccccccccccccccccccccc' },
    ];

    for (const account of accounts) {
      await seedUser(firestore, account.uid);
      await service.recordRegistrationSignals({
        uid: account.uid,
        email: `${account.uid}@example.com`,
        ipAddress: sharedIp,
        userAgent: BROWSER,
        deviceToken: account.token,
      });
    }

    for (const account of accounts) {
      const abuse = (await firestore.collection('users').doc(account.uid).get()).data()
        ?.abuse as { riskBand: string; riskScore: number; ipHash: string; deviceHash: string };
      expect(abuse.riskBand).toBe('allow');
      expect(abuse.riskScore).toBeLessThan(40);
      expect(abuse.ipHash).toMatch(/^[0-9a-f]{64}$/);
      expect(abuse.deviceHash).toMatch(/^[0-9a-f]{64}$/);
      expect(abuse.ipHash).not.toContain(sharedIp);
      expect(abuse.deviceHash).not.toBe(account.token);
    }

    const first = (await firestore.collection('users').doc('house-a').get()).data()!.abuse as {
      deviceHash: string;
      ipHash: string;
    };
    const second = (await firestore.collection('users').doc('house-b').get()).data()!.abuse as {
      deviceHash: string;
      ipHash: string;
    };
    const third = (await firestore.collection('users').doc('house-c').get()).data()!.abuse as {
      deviceHash: string;
      ipHash: string;
      riskSignals: string[];
    };
    expect(first.deviceHash).not.toBe(second.deviceHash);
    expect(first.ipHash).toBe(second.ipHash);
    expect(third.riskSignals).toContain('network_burst');

    const printed = [...warn.mock.calls, ...log.mock.calls].flat().join(' ');
    expect(printed).not.toContain(sharedIp);
    expect(printed).not.toContain('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
  });

  it('a second account on the SAME device with a DIFFERENT email is step-up (verify), not deny — family PC / client §4', async () => {
    const service = makeService('unit-test-hmac-secret', firestore);
    const sharedToken = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

    await seedUser(firestore, 'parent');
    await service.recordRegistrationSignals({
      uid: 'parent',
      email: 'parent@example.com',
      ipAddress: '203.0.113.80',
      userAgent: BROWSER,
      deviceToken: sharedToken,
    });

    await seedUser(firestore, 'child');
    await service.recordRegistrationSignals({
      uid: 'child',
      email: 'child@example.com',
      ipAddress: '203.0.113.80',
      userAgent: BROWSER,
      deviceToken: sharedToken,
    });

    const first = (await firestore.collection('users').doc('parent').get()).data()!.abuse as {
      riskBand: string;
      deviceHash: string;
    };
    const second = (await firestore.collection('users').doc('child').get()).data()!.abuse as {
      riskBand: string;
      riskScore: number;
      riskSignals: string[];
      deviceHash: string;
    };

    expect(first.riskBand).toBe('allow');
    expect(second.deviceHash).toBe(first.deviceHash);
    expect(second.riskSignals).toContain('identity_received_free');
    expect(second.riskBand).toBe('verify');
    expect(second.riskBand).not.toBe('deny');
    expect(second.riskScore).toBeLessThan(70);

    const printed = [...warn.mock.calls, ...log.mock.calls].flat().join(' ');
    expect(printed).not.toContain('parent@example.com');
    expect(printed).not.toContain('child@example.com');
    expect(printed).not.toContain(sharedToken);
  });

  it('does not treat an empty user-agent as bot activity', async () => {
    const service = makeService('unit-test-hmac-secret', firestore);
    await seedUser(firestore, 'private-browser');
    await service.recordRegistrationSignals({
      uid: 'private-browser',
      email: 'private@example.com',
      ipAddress: '203.0.113.12',
      userAgent: '',
      deviceToken: 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
    });
    const abuse = (await firestore.collection('users').doc('private-browser').get()).data()!
      .abuse as { riskSignals: string[]; riskBand: string };
    expect(abuse.riskSignals).not.toContain('bot_activity');
    expect(abuse.riskBand).toBe('allow');
  });

  it('does not throw when the user doc is missing — signup must not fail', async () => {
    const service = makeService('unit-test-hmac-secret', firestore);
    await     expect(
      service.recordRegistrationSignals({
        uid: 'ghost',
        email: 'ghost@example.com',
        ipAddress: '203.0.113.9',
        userAgent: BROWSER,
        deviceToken: 'dddddddddddddddddddddddddddddddd',
      }),
    ).resolves.toBeUndefined();
  });
});

describe('AbuseService.isEnforcementOn kill switch', () => {
  let firestore: InMemoryFirestore;
  let warn: jest.SpyInstance;

  beforeEach(() => {
    firestore = new InMemoryFirestore();
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    warn.mockRestore();
  });

  it('is off when app_settings is missing (deploy must not start denying)', async () => {
    const service = makeService('unit-test-hmac-secret', firestore);
    await expect(service.isEnforcementOn()).resolves.toBe(false);
  });

  it('is off when the stored flag is false', async () => {
    await firestore.collection('app_settings').doc('main').set({
      abuse: { enforcementEnabled: false },
    });
    const service = makeService('unit-test-hmac-secret', firestore);
    await expect(service.isEnforcementOn()).resolves.toBe(false);
  });

  it('is on only when the stored flag is the boolean true', async () => {
    await firestore.collection('app_settings').doc('main').set({
      abuse: { enforcementEnabled: true },
    });
    const service = makeService('unit-test-hmac-secret', firestore);
    await expect(service.isEnforcementOn()).resolves.toBe(true);
  });

  it('fails open when the settings read throws', async () => {
    const broken = {
      firestore: {
        collection: () => {
          throw new Error('firestore down');
        },
      },
    };
    const config = { get: jest.fn() };
    const service = new AbuseService(broken as any, config as any);
    await expect(service.isEnforcementOn()).resolves.toBe(false);
  });
});

describe('AbuseService enforcement (grant, email, caps)', () => {
  let firestore: InMemoryFirestore;
  let warn: jest.SpyInstance;
  let log: jest.SpyInstance;
  const TOKEN = 'ffffffffffffffffffffffffffffffff';

  beforeEach(() => {
    firestore = new InMemoryFirestore();
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    log = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    warn.mockRestore();
    log.mockRestore();
  });

  async function enableEnforcement(extra: Record<string, unknown> = {}) {
    await firestore.collection('app_settings').doc('main').set({
      abuse: { enforcementEnabled: true, ...extra },
    });
  }

  it('does not write grantStatus while the kill switch is off', async () => {
    const service = makeService('unit-test-hmac-secret', firestore);
    await seedUser(firestore, 'observe');
    await service.recordRegistrationSignals({
      uid: 'observe',
      email: 'observe@example.com',
      ipAddress: '203.0.113.1',
      userAgent: BROWSER,
      deviceToken: TOKEN,
    });
    const abuse = (await firestore.collection('users').doc('observe').get()).data()!.abuse as {
      grantStatus?: string;
    };
    expect(abuse.grantStatus).toBeUndefined();
  });

  it('does not mark the device receivedFree when the grant is blocked', async () => {
    await enableEnforcement({ weights: { botActivity: 80 } });
    const service = makeService('unit-test-hmac-secret', firestore);
    await seedUser(firestore, 'bot-user');
    await service.recordRegistrationSignals({
      uid: 'bot-user',
      email: 'bot@example.com',
      ipAddress: '203.0.113.2',
      userAgent: 'curl/8.0',
      deviceToken: TOKEN,
    });
    const abuse = (await firestore.collection('users').doc('bot-user').get()).data()!.abuse as {
      grantStatus: string;
      riskBand: string;
      deviceHash: string;
    };
    expect(abuse.riskBand).toBe('deny');
    expect(abuse.grantStatus).toBe('blocked');
    const device = (await firestore.collection(ABUSE_DEVICES_COLLECTION).doc(abuse.deviceHash).get()).data() as {
      receivedFree: boolean;
    };
    expect(device.receivedFree).toBe(false);
  });

  it('family PC under enforcement lands in pending_step_up, not blocked', async () => {
    await enableEnforcement();
    const service = makeService('unit-test-hmac-secret', firestore);
    await seedUser(firestore, 'parent-e');
    await service.recordRegistrationSignals({
      uid: 'parent-e',
      email: 'parent-e@example.com',
      ipAddress: '203.0.113.81',
      userAgent: BROWSER,
      deviceToken: TOKEN,
    });
    await seedUser(firestore, 'child-e');
    await service.recordRegistrationSignals({
      uid: 'child-e',
      email: 'child-e@example.com',
      ipAddress: '203.0.113.81',
      userAgent: BROWSER,
      deviceToken: TOKEN,
    });
    const child = (await firestore.collection('users').doc('child-e').get()).data()!.abuse as {
      grantStatus: string;
      riskBand: string;
    };
    expect(child.riskBand).toBe('verify');
    expect(child.grantStatus).toBe('pending_step_up');
    expect(child.grantStatus).not.toBe('blocked');
  });

  it('blocks Free create for a blocked grant and allows a paid plan', async () => {
    await enableEnforcement();
    await seedUser(firestore, 'blocked-u');
    await firestore.collection('users').doc('blocked-u').set({
      uid: 'blocked-u',
      subscription: { plan: 'free', status: 'active' },
      usage: { cvsCreated: 0, coverLettersCreated: 0, aiCreditsUsed: 0, exportsThisMonth: 0 },
      abuse: { grantStatus: 'blocked', riskBand: 'deny', riskScore: 80, riskSignals: [] },
    });
    const service = makeService('unit-test-hmac-secret', firestore);
    await expect(service.assertNewConsumption('blocked-u', 'create')).rejects.toMatchObject({
      response: { code: 'ABUSE_GRANT_BLOCKED' },
    });

    await firestore.collection('users').doc('blocked-u').set({
      uid: 'blocked-u',
      subscription: { plan: 'pro', status: 'active' },
      usage: { cvsCreated: 0, coverLettersCreated: 0, aiCreditsUsed: 0, exportsThisMonth: 0 },
      abuse: { grantStatus: 'blocked', riskBand: 'deny', riskScore: 80, riskSignals: [] },
    });
    const paid = makeService('unit-test-hmac-secret', firestore);
    await expect(paid.assertNewConsumption('blocked-u', 'create')).resolves.toBeUndefined();
  });

  it('uses admin.auth.getUser as the email-verify source of truth (token lag)', async () => {
    await enableEnforcement();
    await firestore.collection('users').doc('lag').set({
      uid: 'lag',
      subscription: { plan: 'free', status: 'active' },
      usage: { cvsCreated: 0, coverLettersCreated: 0, aiCreditsUsed: 0, exportsThisMonth: 0 },
      abuse: { grantStatus: 'eligible' },
    });
    const unverified = { getUser: jest.fn().mockResolvedValue({ emailVerified: false }) };
    const service = makeService('unit-test-hmac-secret', firestore, unverified);
    await expect(service.assertNewConsumption('lag', 'create')).rejects.toMatchObject({
      response: { code: 'ABUSE_EMAIL_UNVERIFIED' },
    });
    await expect(service.assertNewConsumption('lag', 'export')).resolves.toBeUndefined();

    const verified = { getUser: jest.fn().mockResolvedValue({ emailVerified: true }) };
    const afterClick = makeService('unit-test-hmac-secret', firestore, verified);
    await expect(afterClick.assertNewConsumption('lag', 'create')).resolves.toBeUndefined();
  });

  it('promotes pending_step_up to eligible after the cooldown without a second score', async () => {
    await enableEnforcement();
    await firestore.collection('users').doc('wait').set({
      uid: 'wait',
      subscription: { plan: 'free', status: 'active' },
      usage: { cvsCreated: 0, coverLettersCreated: 0, aiCreditsUsed: 0, exportsThisMonth: 0 },
      abuse: {
        grantStatus: 'pending_step_up',
        cooldownEndsAt: new Date('2020-01-01T00:00:00.000Z'),
        deviceHash: null,
        riskBand: 'verify',
        riskScore: 55,
        riskSignals: ['identity_received_free'],
      },
    });
    const service = makeService('unit-test-hmac-secret', firestore);
    await expect(service.assertNewConsumption('wait', 'create')).resolves.toBeUndefined();
    const abuse = (await firestore.collection('users').doc('wait').get()).data()!.abuse as {
      grantStatus: string;
    };
    expect(abuse.grantStatus).toBe('eligible');
  });

  it('caps new creates per hashed network at 10/hour when enforcement is on', async () => {
    await enableEnforcement();
    const service = makeService('unit-test-hmac-secret', firestore);
    const ip = '203.0.113.200';
    for (let i = 0; i < 10; i++) {
      await seedUser(firestore, `flood-${i}`);
      await service.recordRegistrationSignals({
        uid: `flood-${i}`,
        email: `flood-${i}@example.com`,
        ipAddress: ip,
        userAgent: BROWSER,
        deviceToken: `${i}`.padStart(32, 'a'),
      });
    }
    const gated = makeService('unit-test-hmac-secret', firestore);
    await expect(gated.assertNetworkCreateAllowed(ip)).rejects.toMatchObject({
      response: { code: 'ABUSE_NETWORK_CREATE_CAP' },
    });
  });

  it('returns a stored AI result for a repeated Idempotency-Key', async () => {
    const service = makeService('unit-test-hmac-secret', firestore);
    const run = jest.fn().mockResolvedValue({ content: 'once' });
    const first = await service.withIdempotency('u1', 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', run);
    const second = await service.withIdempotency('u1', 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', run);
    expect(first).toEqual({ content: 'once' });
    expect(second).toEqual({ content: 'once' });
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('CRM release sets grantStatus=granted without logging email', async () => {
    await seedUser(firestore, 'release-me');
    await firestore.collection('users').doc('release-me').set({
      uid: 'release-me',
      email: 'secret@example.com',
      subscription: { plan: 'free', status: 'active' },
      abuse: { grantStatus: 'blocked', deviceHash: null, riskBand: 'deny', riskScore: 80, riskSignals: [] },
    });
    const service = makeService('unit-test-hmac-secret', firestore);
    const user = await service.releaseFreeGrant('release-me');
    expect(user.abuse?.grantStatus).toBe('granted');
    const printed = [...warn.mock.calls, ...log.mock.calls].flat().join(' ');
    expect(printed).toContain('uid=release-me');
    expect(printed).not.toContain('secret@example.com');
  });
});

