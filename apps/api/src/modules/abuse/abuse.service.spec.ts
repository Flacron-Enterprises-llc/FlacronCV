import { Logger } from '@nestjs/common';
import { AbuseService } from './abuse.service';
import { InMemoryFirestore } from '../firebase/in-memory-firestore';
import { ABUSE_DEVICES_COLLECTION, ABUSE_NETWORKS_COLLECTION } from './abuse.constants';

const BROWSER =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0.0.0';

function makeService(secret: string | undefined, firestore: InMemoryFirestore) {
  const config = {
    get: jest.fn((key: string) => (key === 'abuseHmacSecret' ? secret : undefined)),
  };
  return new AbuseService({ firestore } as any, config as any);
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

  it('does not throw when the user doc is missing — signup must not fail', async () => {
    const service = makeService('unit-test-hmac-secret', firestore);
    await expect(
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
