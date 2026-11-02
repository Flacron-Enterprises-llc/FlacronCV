import { createTestDatabase, TestDatabase } from '../testing';

describe('phase 1 schema', () => {
  let db: TestDatabase;

  beforeAll(async () => {
    db = await createTestDatabase('schema');
    await db.pool.query(
      `INSERT INTO catalog_versions (version, published_at, snapshot) VALUES ('test-v', now(), '{}'::jsonb)`,
    );
  });

  afterAll(async () => {
    if (db) await db.drop();
  });

  async function insertAccount(planId = 'starter', extra: Record<string, unknown> = {}) {
    const user = await db.pool.query<{ id: string }>(
      `INSERT INTO users (auth_user_id) VALUES ($1) RETURNING id`,
      [`uid-${Math.random()}`],
    );
    const ws = await db.pool.query<{ id: string }>(
      `INSERT INTO workspaces (owner_user_id, name) VALUES ($1, 'w') RETURNING id`,
      [user.rows[0].id],
    );
    const columns = {
      workspace_id: ws.rows[0].id,
      plan_id: planId,
      catalog_version: 'test-v',
      interval: 'monthly',
      status: 'active',
      allowance_anchor: '2026-10-01T00:00:00Z',
      allowance_period_start: '2026-10-01T00:00:00Z',
      allowance_period_end: '2026-11-01T00:00:00Z',
      ...extra,
    };
    const names = Object.keys(columns);
    const res = await db.pool.query<{ id: string; workspace_id: string }>(
      `INSERT INTO billing_accounts (${names.join(', ')})
       VALUES (${names.map((_, i) => `$${i + 1}`).join(', ')})
       RETURNING id, workspace_id`,
      Object.values(columns),
    );
    return res.rows[0];
  }

  async function insertLedger(accountId: string, workspaceId: string, key: string, candidate: string | null = null) {
    const res = await db.pool.query<{ id: string }>(
      `INSERT INTO usage_ledger
         (billing_account_id, workspace_id, candidate_auth_user_id, unit, quantity, request_id, idempotency_key,
          request_fingerprint, allowance_period_start)
       VALUES ($1, $2, $4, 'document_credit', 1, 'r', $3, 'f', '2026-10-01T00:00:00Z')
       RETURNING id`,
      [accountId, workspaceId, key, candidate],
    );
    return res.rows[0].id;
  }

  it('creates the tables in the throwaway schema, not public', async () => {
    const res = await db.pool.query<{ table_schema: string }>(
      `SELECT table_schema FROM information_schema.tables WHERE table_name = 'usage_ledger'`,
    );
    expect(res.rows.map((r) => r.table_schema)).toContain(db.schema);
  });

  it('rejects a legacy plan id without the matching legacy_plan', async () => {
    await expect(insertAccount('legacy_pro')).rejects.toThrow(/billing_accounts_legacy_plan_matches/);
  });

  it('accepts a legacy Pro row with legacy_plan pro', async () => {
    await expect(insertAccount('legacy_pro', { legacy_plan: 'pro', origin: 'migrated' })).resolves.toBeDefined();
  });

  it('rejects legacy_plan on a V2 plan', async () => {
    await expect(insertAccount('professional', { legacy_plan: 'pro' })).rejects.toThrow(
      /billing_accounts_legacy_plan_matches/,
    );
  });

  it('rejects a Free row with a provider', async () => {
    await expect(insertAccount('free', { provider: 'stripe' })).rejects.toThrow(/billing_accounts_free_has_no_provider/);
  });

  it('rejects trialing without trial_end', async () => {
    await expect(insertAccount('professional', { status: 'trialing' })).rejects.toThrow(
      /billing_accounts_trialing_has_end/,
    );
  });

  it('rejects auto top-up without a spending cap', async () => {
    await expect(insertAccount('starter', { auto_topup: true })).rejects.toThrow(/billing_accounts_topup_needs_cap/);
  });

  it('allows one workspace one billing account', async () => {
    const account = await insertAccount();
    await expect(
      db.pool.query(
        `INSERT INTO billing_accounts (workspace_id, plan_id, catalog_version, interval, status,
           allowance_anchor, allowance_period_start, allowance_period_end)
         VALUES ($1, 'free', 'test-v', 'monthly', 'active', now(), now(), now() + interval '1 month')`,
        [account.workspace_id],
      ),
    ).rejects.toThrow(/duplicate key/);
  });

  describe('usage_ledger guard', () => {
    let account: { id: string; workspace_id: string };

    beforeAll(async () => {
      account = await insertAccount();
    });

    it('rejects the same idempotency key twice on one account', async () => {
      await insertLedger(account.id, account.workspace_id, 'dup');
      await expect(insertLedger(account.id, account.workspace_id, 'dup')).rejects.toThrow(
        /usage_ledger_idempotency_key_unique/,
      );
    });

    it('refuses a delete', async () => {
      const id = await insertLedger(account.id, account.workspace_id, 'del');
      await expect(db.pool.query(`DELETE FROM usage_ledger WHERE id = $1`, [id])).rejects.toThrow(/not deleted/);
    });

    it('refuses a quantity rewrite', async () => {
      const id = await insertLedger(account.id, account.workspace_id, 'qty');
      await expect(db.pool.query(`UPDATE usage_ledger SET quantity = 2 WHERE id = $1`, [id])).rejects.toThrow(
        /not rewritten/,
      );
    });

    it('allows reserved to committed, then refuses committed to released', async () => {
      const id = await insertLedger(account.id, account.workspace_id, 'commit');
      await db.pool.query(`UPDATE usage_ledger SET state = 'committed', committed_at = now() WHERE id = $1`, [id]);
      await expect(
        db.pool.query(
          `UPDATE usage_ledger SET state = 'released', committed_at = NULL, released_at = now() WHERE id = $1`,
          [id],
        ),
      ).rejects.toThrow(/state committed is final/);
    });

    it('refuses a committed state without committed_at', async () => {
      const id = await insertLedger(account.id, account.workspace_id, 'no-ts');
      await expect(db.pool.query(`UPDATE usage_ledger SET state = 'committed' WHERE id = $1`, [id])).rejects.toThrow(
        /usage_ledger_committed_at_matches/,
      );
    });

    it('allows clearing the candidate and refuses setting a new one', async () => {
      const id = await insertLedger(account.id, account.workspace_id, 'cand', 'candidate-1');
      await expect(
        db.pool.query(`UPDATE usage_ledger SET candidate_auth_user_id = 'candidate-2' WHERE id = $1`, [id]),
      ).rejects.toThrow(/can only be cleared/);
      await db.pool.query(`UPDATE usage_ledger SET candidate_auth_user_id = NULL WHERE id = $1`, [id]);
      const res = await db.pool.query(`SELECT candidate_auth_user_id FROM usage_ledger WHERE id = $1`, [id]);
      expect(res.rows[0].candidate_auth_user_id).toBeNull();
    });
  });
});
