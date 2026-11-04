import { CATALOG_VERSION } from '@flacroncv/career-shared';
import { AlertService, NotificationSendError, RecordingAlertNotifier } from './alert.service';
import type { AlertNotifier, ChannelDelivery } from './alert.service';
import { BillingService } from '../billing/billing.service';
import type { VerifiedIdentity } from '../identity/id-token';
import { IdentityService } from '../identity/identity.service';
import type { Principal } from '../identity/identity.service';
import { MeteringService } from '../metering/metering.service';
import { OpportunityService } from '../opportunities/opportunity.service';
import { CareerProfileService } from '../profile/career-profile.service';
import { ResumeStudioService } from '../resumes/resume.service';
import { TestClock } from '../testing/billing-fixture';
import { FakeTextModel } from '../testing/fake-ai';
import { createTestDatabase, TestDatabase } from '../testing/test-database';

/** A notifier we script per test. Nothing leaves the process. */
class ScriptedNotifier implements AlertNotifier {
  readonly sent: ChannelDelivery[] = [];
  next: Array<'ok' | 'not_sent' | 'uncertain' | 'accept_then_throw'> = [];
  gate: Promise<void> | null = null;
  constructor(readonly idempotent = false) {}
  async deliver(item: ChannelDelivery): Promise<void> {
    if (this.gate) await this.gate;
    const step = this.next.shift() ?? 'ok';
    if (step === 'not_sent') throw new NotificationSendError('not_sent');
    if (step === 'uncertain') throw new Error('timeout');
    this.sent.push(item);
    if (step === 'accept_then_throw') throw new Error('connection reset after the provider accepted it');
  }
}

describe('notification outbox (digests; fictional people; no real email, push or Telegram)', () => {
  let db: TestDatabase;
  let clock: TestClock;
  let identities: IdentityService;
  let sequence = 0;

  const identity = (uid: string): VerifiedIdentity => ({
    uid,
    email: `${uid}@example.test`,
    emailVerified: true,
    authTime: clock.now(),
    issuedAt: clock.now(),
    signInProvider: 'password',
  });
  const service = (notifier: AlertNotifier) => new AlertService(db.pool, new MeteringService(db.pool, clock), notifier, clock);
  const digest = (alerts: AlertService, p: Principal) =>
    (alerts as unknown as { digestPerson: (p: Principal) => Promise<boolean> }).digestPerson(p);
  const row = async (p: Principal) =>
    (
      await db.pool.query<{ status: string; attempts: number; message_id: string; sent_at: Date | null }>(
        `SELECT status, attempts, message_id, sent_at FROM digests WHERE recipient_auth_user_id = $1`,
        [p.authUserId],
      )
    ).rows;

  /** A person with one surfaced alert item, ready for a weekly email digest. */
  async function personWithAlert(uid: string): Promise<Principal> {
    const model = new FakeTextModel();
    const p = await identities.principal(identity(uid));
    await new CareerProfileService(db.pool, model, clock).createFact(p, { factType: 'skill', value: { name: 'SQL' }, confirmation: 'confirmed' });
    await new ResumeStudioService(db.pool, model, new MeteringService(db.pool, clock)).create(p, { title: uid, language: 'en' });
    const alerts = service(new RecordingAlertNotifier());
    await alerts.createSearch(p, { q: 'SQL' });
    sequence += 1;
    await new OpportunityService(db.pool, clock).ingest(null, [
      {
        provider: 'adzuna',
        sourceId: `outbox-${sequence}`,
        title: 'SQL analyst',
        organization: 'Fictional Works',
        description: 'SQL is required.',
        locations: ['London'],
        sourceUrl: `https://example.test/outbox-${sequence}`,
        deadline: null,
        compensation: { minimum: null, maximum: null, currency: null, period: null },
        category: 'job',
        status: 'open',
      },
    ]);
    await alerts.runDue();
    return p;
  }

  beforeAll(async () => {
    db = await createTestDatabase('notification_outbox');
    clock = new TestClock('2026-10-16T09:00:00Z');
    await new BillingService(db.pool, clock).publishCatalog();
    identities = new IdentityService(db.pool, CATALOG_VERSION, clock);
  });

  afterAll(async () => {
    if (db) await db.drop();
  });

  it('two workers at once send one digest', async () => {
    const p = await personWithAlert('box-two');
    const notifier = new ScriptedNotifier();
    let open: () => void = () => undefined;
    notifier.gate = new Promise<void>((resolve) => {
      open = resolve;
    });
    const a = digest(service(notifier), p);
    const b = digest(service(notifier), p);
    await new Promise((r) => setTimeout(r, 100));
    open();
    const results = await Promise.all([a, b]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(notifier.sent).toHaveLength(1);
    expect(await row(p)).toMatchObject([{ status: 'sent', attempts: 1 }]);
  });

  it('a crash before the claim (row pending) is sent once on the next run', async () => {
    const p = await personWithAlert('box-pending');
    const notifier = new ScriptedNotifier();
    // What a crash right after writing the outbox row leaves behind.
    await db.pool.query(
      `INSERT INTO digests (recipient_auth_user_id, period_start, channel, status, sent_at) VALUES ($1, '2026-10-12T00:00:00Z', 'email', 'pending', NULL)`,
      [p.authUserId],
    );
    expect(await digest(service(notifier), p)).toBe(true);
    expect(notifier.sent).toHaveLength(1);
    expect(await digest(service(notifier), p)).toBe(false);
    expect(notifier.sent).toHaveLength(1);
  });

  it('a crash after the provider accepted it is never marked sent and never resent by a non-idempotent notifier', async () => {
    const p = await personWithAlert('box-crash');
    const notifier = new ScriptedNotifier();
    // A worker claimed and sent, then died before the acknowledgement.
    await db.pool.query(
      `INSERT INTO digests (recipient_auth_user_id, period_start, channel, status, sent_at, attempts, claim_token, claimed_until)
       VALUES ($1, '2026-10-12T00:00:00Z', 'email', 'sending', NULL, 1, gen_random_uuid(), '2026-10-16T08:00:00Z')`,
      [p.authUserId],
    );
    expect(await digest(service(notifier), p)).toBe(false);
    expect(notifier.sent).toHaveLength(0);
    expect(await row(p)).toMatchObject([{ status: 'uncertain', sent_at: null }]);
  });

  it('an idempotent notifier retries an interrupted send with the same message id', async () => {
    const p = await personWithAlert('box-idem');
    const notifier = new ScriptedNotifier(true);
    notifier.next = ['accept_then_throw'];
    expect(await digest(service(notifier), p)).toBe(false);
    expect(await row(p)).toMatchObject([{ status: 'uncertain' }]);
    expect(await digest(service(notifier), p)).toBe(true);
    expect(notifier.sent).toHaveLength(2);
    expect(notifier.sent[0].messageId).toBe(notifier.sent[1].messageId);
    expect(await row(p)).toMatchObject([{ status: 'sent', attempts: 2 }]);
  });

  it('a timeout is uncertain: not sent again, not marked sent, items not marked delivered', async () => {
    const p = await personWithAlert('box-timeout');
    const notifier = new ScriptedNotifier();
    notifier.next = ['uncertain'];
    expect(await digest(service(notifier), p)).toBe(false);
    expect(await digest(service(notifier), p)).toBe(false);
    expect(notifier.sent).toHaveLength(0);
    expect(await row(p)).toMatchObject([{ status: 'uncertain', sent_at: null }]);
    const delivered = await db.pool.query(
      `SELECT 1 FROM notification_deliveries d JOIN alert_items a ON a.id = d.alert_item_id WHERE a.recipient_auth_user_id = $1`,
      [p.authUserId],
    );
    expect(delivered.rows).toHaveLength(0);
  });

  it('a definite refusal is retried after a backoff, at most five attempts, then failed', async () => {
    const p = await personWithAlert('box-retry');
    const notifier = new ScriptedNotifier();
    notifier.next = ['not_sent', 'not_sent'];
    expect(await digest(service(notifier), p)).toBe(false);
    expect(await row(p)).toMatchObject([{ status: 'pending', attempts: 1 }]);
    expect(await digest(service(notifier), p)).toBe(false); // inside the backoff: not even tried
    expect(await row(p)).toMatchObject([{ attempts: 1 }]);
    clock.set('2026-10-16T09:10:00Z');
    expect(await digest(service(notifier), p)).toBe(false);
    clock.set('2026-10-16T09:30:00Z');
    expect(await digest(service(notifier), p)).toBe(true);
    expect(await row(p)).toMatchObject([{ status: 'sent', attempts: 3 }]);

    const q = await personWithAlert('box-give-up');
    const always = new ScriptedNotifier();
    always.next = Array.from({ length: 10 }, () => 'not_sent' as const);
    for (let i = 0; i < 6; i += 1) {
      clock.set(new Date(clock.now().getTime() + 2 * 60 * 60_000).toISOString());
      await digest(service(always), q);
    }
    expect(await row(q)).toMatchObject([{ status: 'failed', attempts: 5 }]);
  });

  it('immediate channels: two workers claim one row, one send, recorded once with a stable message id', async () => {
    const p = await personWithAlert('box-push');
    const item = (await db.pool.query<{ id: string }>(`SELECT id FROM alert_items WHERE recipient_auth_user_id = $1`, [p.authUserId])).rows[0];
    await db.pool.query(`INSERT INTO notification_deliveries (alert_item_id, channel, status) VALUES ($1, 'push', 'pending')`, [item.id]);
    const notifier = new ScriptedNotifier();
    let open: () => void = () => undefined;
    notifier.gate = new Promise<void>((resolve) => {
      open = resolve;
    });
    type Sender = { sendDelivery: (p: Principal, item: { id: string; title: string }, channel: 'push') => Promise<string | null> };
    const send = (alerts: AlertService) => (alerts as unknown as Sender).sendDelivery(p, { id: item.id, title: 'SQL analyst' }, 'push');
    const both = Promise.all([send(service(notifier)), send(service(notifier))]);
    await new Promise((r) => setTimeout(r, 100));
    open();
    const outcomes = await both;
    expect(outcomes.filter((o) => o === 'sent')).toHaveLength(1);
    expect(outcomes.filter((o) => o === null)).toHaveLength(1);
    expect(notifier.sent).toHaveLength(1);
    const stored = await db.pool.query(`SELECT status, attempts, message_id FROM notification_deliveries WHERE alert_item_id = $1 AND channel = 'push'`, [item.id]);
    expect(stored.rows[0]).toMatchObject({ status: 'sent', attempts: 1, message_id: notifier.sent[0].messageId });
  });

  it('a person whose deletion started is never claimed or sent to', async () => {
    const p = await personWithAlert('box-deleting');
    const notifier = new ScriptedNotifier();
    await db.pool.query(`UPDATE users SET deletion_requested_at = now() WHERE auth_user_id = $1`, [p.authUserId]);
    expect(await digest(service(notifier), p)).toBe(false);
    expect(notifier.sent).toHaveLength(0);
  });
});
