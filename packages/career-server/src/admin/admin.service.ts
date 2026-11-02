import type { Pool } from 'pg';
import { CATALOG_VERSION } from '@flacroncv/career-shared';
import type { Clock } from '../billing/billing.service';
import { CatalogStore, publishCatalog } from '../billing/catalog';
import { BillingError } from '../billing/errors';
import type { Principal } from '../identity/identity.service';
import { sesSettings } from '../mail/ses-mailer';

/** Fallback when nothing is bound. Health never pings a vendor. */
export const PROVIDER_HEALTH = [
  { name: 'stripe', status: 'unconfigured' },
  { name: 'apple', status: 'unconfigured' },
  { name: 'google', status: 'unconfigured' },
  { name: 'text_model', status: 'unconfigured' },
  { name: 'speech_transcription', status: 'unconfigured' },
  { name: 'job_feeds', status: 'unconfigured' },
  { name: 'map_tiles', status: 'unconfigured' },
  { name: 'geocoding', status: 'unconfigured' },
  { name: 'storage', status: 'unconfigured' },
  { name: 'email', status: 'unconfigured' },
] as const;

/** Binding status from env names only. No network call and no secret values. */
export function providerHealthFromEnv(env: NodeJS.ProcessEnv = process.env): Array<{ name: string; status: string }> {
  const stripeKey = env.STRIPE_SECRET_KEY?.trim() ?? '';
  const stripe = /^(sk_test_|rk_test_)/.test(stripeKey)
    ? 'sandbox'
    : /^(sk_live_|rk_live_)/.test(stripeKey) && env.NODE_ENV === 'production'
      ? 'configured'
      : 'unconfigured';
  const text =
    env.AI_PROVIDER?.trim().toLowerCase() === 'openai' && (env.OPENAI_API_KEY?.trim() ?? '').length > 0
      ? 'configured'
      : 'unconfigured';
  const storageMode = env.OBJECT_STORAGE?.trim().toLowerCase() ?? '';
  const storage =
    storageMode === 'local'
      ? 'local'
      : storageMode === 's3' && (env.OBJECT_STORAGE_BUCKET?.trim() ?? '').length > 0
        ? 'configured'
        : 'unconfigured';
  const ses = sesSettings(env);
  const hasSes = ses.accessKeyId.length > 0 && ses.secretAccessKey.length > 0 && ses.fromEmail.length > 0;
  const delivery = env.MAIL_DELIVERY?.trim().toLowerCase() ?? '';
  const email =
    delivery === 'sandbox' && hasSes
      ? 'sandbox'
      : delivery === 'live' && env.NODE_ENV === 'production' && hasSes
        ? 'configured'
        : 'unconfigured';
  return [
    { name: 'stripe', status: stripe },
    { name: 'apple', status: 'unconfigured' },
    { name: 'google', status: 'unconfigured' },
    { name: 'text_model', status: text },
    { name: 'speech_transcription', status: 'unconfigured' },
    { name: 'job_feeds', status: 'unconfigured' },
    { name: 'map_tiles', status: 'unconfigured' },
    {
      name: 'geocoding',
      status:
        env.GEOCODING_PROVIDER?.trim().toLowerCase() === 'google' && (env.GEOCODING_API_KEY?.trim() ?? '').length > 0
          ? 'configured'
          : 'unconfigured',
    },
    { name: 'storage', status: storage },
    { name: 'email', status: email },
  ];
}

const systemClock: Clock = { now: () => new Date() };

export function adminUidSet(raw: string | undefined): ReadonlySet<string> {
  if (!raw) return new Set();
  const ids = raw
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0 && part.length <= 128);
  return new Set(ids);
}

export interface AdminFlag {
  feature: string;
  enabled: boolean;
  source: 'flag' | 'phase';
}

/**
 * Platform admin tools. A uid that is not on the allowlist is refused
 * before any write. Prices are not accepted from the client. A published
 * catalog version is not rewritten.
 */
export class AdminService {
  private readonly catalogs = new CatalogStore();

  constructor(
    private readonly pool: Pool,
    private readonly admins: ReadonlySet<string>,
    private readonly clock: Clock = systemClock,
  ) {}

  async catalog(owner: Principal): Promise<{ items: Array<{ version: string; publishedAt: string }> }> {
    this.assertAdmin(owner);
    const rows = await this.pool.query<{ version: string; published_at: Date }>(
      `SELECT version, published_at FROM catalog_versions ORDER BY published_at, version`,
    );
    return { items: rows.rows.map((row) => ({ version: row.version, publishedAt: row.published_at.toISOString() })) };
  }

  async publish(owner: Principal): Promise<{ result: 'inserted' | 'unchanged' }> {
    this.assertAdmin(owner);
    const result = await publishCatalog(this.pool, this.clock.now());
    await this.record(owner, `catalog.${result}`, CATALOG_VERSION);
    return { result };
  }

  async flags(owner: Principal): Promise<{ items: AdminFlag[] }> {
    this.assertAdmin(owner);
    return { items: await this.flagList() };
  }

  async setFlag(owner: Principal, feature: string | undefined, enabled: boolean | undefined): Promise<{ items: AdminFlag[] }> {
    this.assertAdmin(owner);
    if (typeof feature !== 'string' || feature.length === 0) {
      throw new BillingError('validation_error', { field: 'feature', reason: 'invalid' });
    }
    if (typeof enabled !== 'boolean') throw new BillingError('validation_error', { field: 'enabled', reason: 'invalid' });
    const snapshot = await this.catalogs.get(this.pool, CATALOG_VERSION);
    if (!Object.prototype.hasOwnProperty.call(snapshot.featurePhase, feature)) {
      throw new BillingError('validation_error', { field: 'feature', reason: 'unknown' });
    }
    await this.pool.query(
      `INSERT INTO feature_flags (feature, enabled, updated_at, updated_by)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (feature) DO UPDATE
         SET enabled = EXCLUDED.enabled, updated_at = EXCLUDED.updated_at, updated_by = EXCLUDED.updated_by`,
      [feature, enabled, this.clock.now(), owner.authUserId],
    );
    await this.record(owner, 'flag.set', feature);
    return { items: await this.flagList() };
  }

  async health(owner: Principal): Promise<{ providers: Array<{ name: string; status: string }> }> {
    this.assertAdmin(owner);
    return { providers: providerHealthFromEnv() };
  }

  async audit(owner: Principal): Promise<{ items: Array<{ id: string; actorAuthUserId: string; action: string; target: string; createdAt: string }> }> {
    this.assertAdmin(owner);
    const rows = await this.pool.query<{ id: string; actor_auth_user_id: string; action: string; target: string; created_at: Date }>(
      `SELECT id, actor_auth_user_id, action, target, created_at FROM admin_audit ORDER BY created_at DESC, id DESC LIMIT 100`,
    );
    return {
      items: rows.rows.map((row) => ({
        id: row.id,
        actorAuthUserId: row.actor_auth_user_id,
        action: row.action,
        target: row.target,
        createdAt: row.created_at.toISOString(),
      })),
    };
  }

  private assertAdmin(owner: Principal): void {
    if (!this.admins.has(owner.authUserId)) throw new BillingError('permission_denied');
  }

  private async flagList(): Promise<AdminFlag[]> {
    const snapshot = await this.catalogs.get(this.pool, CATALOG_VERSION);
    const stored = await this.pool.query<{ feature: string; enabled: boolean }>(`SELECT feature, enabled FROM feature_flags`);
    const chosen = new Map(stored.rows.map((row) => [row.feature, row.enabled]));
    return Object.keys(snapshot.featurePhase).map((feature) => {
      const flag = chosen.get(feature);
      if (flag === undefined) return { feature, enabled: snapshot.featurePhase[feature] === 1, source: 'phase' as const };
      return { feature, enabled: flag, source: 'flag' as const };
    });
  }

  private async record(owner: Principal, action: string, target: string): Promise<void> {
    await this.pool.query(
      `INSERT INTO admin_audit (actor_auth_user_id, action, target) VALUES ($1, $2, $3)`,
      [owner.authUserId, action, target],
    );
  }
}
