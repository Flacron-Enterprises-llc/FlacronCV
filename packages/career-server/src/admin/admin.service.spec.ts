import { CATALOG_VERSION } from '@flacroncv/career-shared';
import { BillingService } from '../billing/billing.service';
import type { VerifiedIdentity } from '../identity/id-token';
import { IdentityService } from '../identity/identity.service';
import type { Principal } from '../identity/identity.service';
import { isFeatureEnabled } from '../metering/access';
import { CatalogStore } from '../billing/catalog';
import { createTestDatabase, TestDatabase } from '../testing/test-database';
import { AdminService, providerHealthFromEnv } from './admin.service';

function identity(uid: string): VerifiedIdentity {
  const at = new Date('2026-10-17T03:00:00Z');
  return { uid, email: null, emailVerified: true, authTime: at, issuedAt: at, signInProvider: 'password' };
}

describe('AdminService', () => {
  let db: TestDatabase;
  let identities: IdentityService;
  let admin: AdminService;

  beforeAll(async () => {
    db = await createTestDatabase('admin');
    await new BillingService(db.pool).publishCatalog();
    identities = new IdentityService(db.pool, CATALOG_VERSION);
    admin = new AdminService(db.pool, new Set(['admin-ada']));
  });

  afterAll(async () => {
    if (db) await db.drop();
  });

  async function person(uid: string): Promise<Principal> {
    return identities.principal(identity(uid));
  }

  it('refuses a person who is not on the allowlist and does not write', async () => {
    const ada = await person('admin-nope');
    await expect(admin.publish(ada)).rejects.toMatchObject({ code: 'permission_denied' });
    await expect(admin.health(ada)).rejects.toMatchObject({ code: 'permission_denied' });
    const audit = await db.pool.query(`SELECT 1 FROM admin_audit`);
    expect(audit.rowCount).toBe(0);
  });

  it('publishes without rewriting the sold version, and a flag is audited', async () => {
    const ada = await person('admin-ada');
    const before = await db.pool.query<{ snapshot: unknown }>(`SELECT snapshot FROM catalog_versions WHERE version = $1`, [CATALOG_VERSION]);
    const published = await admin.publish(ada);
    expect(published.result).toBe('unchanged');
    const after = await db.pool.query<{ snapshot: unknown }>(`SELECT snapshot FROM catalog_versions WHERE version = $1`, [CATALOG_VERSION]);
    expect(after.rows[0].snapshot).toEqual(before.rows[0].snapshot);
    const listed = await admin.catalog(ada);
    expect(listed.items.map((item) => item.version)).toContain(CATALOG_VERSION);
    expect(JSON.stringify(listed)).not.toContain('price_');

    const flags = await admin.flags(ada);
    expect(flags.items.find((item) => item.feature === 'documentCredits')).toMatchObject({ enabled: true, source: 'phase' });
    const saved = await admin.setFlag(ada, 'documentCredits', false);
    expect(saved.items.find((item) => item.feature === 'documentCredits')).toMatchObject({ enabled: false, source: 'flag' });
    const snapshot = await new CatalogStore().get(db.pool, CATALOG_VERSION);
    expect(await isFeatureEnabled(db.pool, snapshot, 'documentCredits')).toBe(false);
    await expect(admin.setFlag(ada, 'not_a_feature', true)).rejects.toMatchObject({ code: 'validation_error' });

    const health = await admin.health(ada);
    expect(health.providers.every((row) => row.status === 'unconfigured')).toBe(true);
    expect(JSON.stringify(health)).not.toContain('sk_');
    expect(providerHealthFromEnv({ STRIPE_SECRET_KEY: 'sk_test_x', AI_PROVIDER: 'openai', OPENAI_API_KEY: 'sk-x', OBJECT_STORAGE: 'local', MAIL_DELIVERY: 'sandbox', AWS_ACCESS_KEY_ID: 'AKIA', AWS_SECRET_ACCESS_KEY: 'secret', SES_FROM_EMAIL: 'a@example.test' }).map((row) => `${row.name}:${row.status}`)).toEqual([
      'stripe:sandbox',
      'apple:unconfigured',
      'google:unconfigured',
      'text_model:configured',
      'speech_transcription:unconfigured',
      'job_feeds:unconfigured',
      'map_tiles:unconfigured',
      'geocoding:unconfigured',
      'storage:local',
      'email:sandbox',
    ]);

    const audit = await admin.audit(ada);
    expect(
      providerHealthFromEnv({
        GEOCODING_PROVIDER: 'google',
        GEOCODING_API_KEY: 'secret',
      }).find((row) => row.name === 'geocoding'),
    ).toEqual({ name: 'geocoding', status: 'configured' });
    expect(JSON.stringify(providerHealthFromEnv({ GEOCODING_PROVIDER: 'google', GEOCODING_API_KEY: 'secret' }))).not.toContain(
      'secret',
    );

    expect(audit.items.map((item) => item.action).sort()).toEqual(['catalog.unchanged', 'flag.set']);
    expect(audit.items.every((item) => item.actorAuthUserId === 'admin-ada')).toBe(true);
    expect(JSON.stringify(audit)).not.toContain('SecretCo');
  });
});
