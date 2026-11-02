import { StorageCleanupScheduler } from './storage-cleanup.scheduler';

/** The three sweeps are independent: one failing must not starve the others. */
describe('StorageCleanupScheduler.tick', () => {
  function build(failing: 'storage' | 'interrupted' | 'none') {
    const calls: string[] = [];
    const privacy = {
      finishInterruptedDeletions: jest.fn(async () => {
        calls.push('interrupted');
        if (failing === 'interrupted') throw new Error('db down');
      }),
      eraseClosedV1Accounts: jest.fn(async (isClosed: (uid: string) => Promise<boolean>) => {
        calls.push('closed');
        return isClosed('u1');
      }),
    };
    const v1 = { read: jest.fn(async () => ({ active: false })) };
    const scheduler = new StorageCleanupScheduler(
      { connectionPool: {} } as never,
      {} as never,
      privacy as never,
      v1 as never,
    );
    (scheduler as unknown as { cleanup: { runOnce: () => Promise<void> } }).cleanup = {
      runOnce: async () => {
        calls.push('storage');
        if (failing === 'storage') throw new Error('bucket unavailable');
      },
    };
    (scheduler as unknown as { logger: { warn: jest.Mock } }).logger = { warn: jest.fn() };
    return { scheduler, calls, privacy, v1 };
  }

  it('still erases closed V1 accounts when object storage is down', async () => {
    const { scheduler, calls, v1 } = build('storage');
    await scheduler.tick();
    expect(calls).toEqual(['storage', 'interrupted', 'closed']);
    expect(v1.read).toHaveBeenCalledWith('u1');
  });

  it('still erases closed V1 accounts when finishing interrupted deletions fails', async () => {
    const { scheduler, calls } = build('interrupted');
    await scheduler.tick();
    expect(calls).toEqual(['storage', 'interrupted', 'closed']);
  });

  it('runs every step once on a healthy tick and can tick again', async () => {
    const { scheduler, calls } = build('none');
    await scheduler.tick();
    await scheduler.tick();
    expect(calls).toEqual(['storage', 'interrupted', 'closed', 'storage', 'interrupted', 'closed']);
  });
});
