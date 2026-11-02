import { StorageCleanupScheduler } from '../src/storage/storage-cleanup.scheduler';
import { createTestApp, TestApp } from './support';

/** The sweep is wired into the API (memory storage here) and stays off in tests unless asked for. */
describe('storage cleanup in the API', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp('api_storage_cleanup');
  });

  afterAll(async () => {
    if (t) await t.close();
  });

  it('resolves the scheduler and sweeps a due orphan on a tick', async () => {
    const scheduler = t.app.get(StorageCleanupScheduler);
    await t.db.pool.query(
      `INSERT INTO stored_object_intents (object_key, candidate_auth_user_id, not_before) VALUES ('evidence/ws/p/item/orphan', 'nobody', now() - interval '1 minute')`,
    );
    await scheduler.tick();
    expect((await t.db.pool.query(`SELECT 1 FROM stored_object_intents`)).rowCount).toBe(0);
  });
});
