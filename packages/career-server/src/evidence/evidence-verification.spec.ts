import { CATALOG_VERSION } from '@flacroncv/career-shared';
import { AdminService } from '../admin/admin.service';
import { BillingService } from '../billing/billing.service';
import { isBillingError } from '../billing/errors';
import type { VerifiedIdentity } from '../identity/id-token';
import { IdentityService } from '../identity/identity.service';
import type { Principal } from '../identity/identity.service';
import { TestClock } from '../testing/billing-fixture';
import { createTestDatabase, TestDatabase } from '../testing/test-database';
import { EvidenceService } from './evidence.service';

function identity(uid: string): VerifiedIdentity {
  const at = new Date('2026-11-14T10:00:00Z');
  return { uid, email: `${uid}@example.test`, emailVerified: true, authTime: at, issuedAt: at, signInProvider: 'password' };
}

describe('Evidence verification model (CV11, spec section 25)', () => {
  let db: TestDatabase;
  let clock: TestClock;
  let identities: IdentityService;
  let evidence: EvidenceService;
  let admin: AdminService;
  let ada: Principal;
  let operator: Principal;

  beforeAll(async () => {
    db = await createTestDatabase('evidence_verify');
    clock = new TestClock('2026-11-14T10:00:00Z');
    await new BillingService(db.pool, clock).publishCatalog();
    await db.pool.query(`INSERT INTO feature_flags (feature, enabled) VALUES ('evidenceItems', true) ON CONFLICT (feature) DO UPDATE SET enabled = true`);
    identities = new IdentityService(db.pool, CATALOG_VERSION, clock);
    ada = await identities.principal(identity('ada-verify'));
    operator = await identities.principal(identity('operator-verify'));
    await db.pool.query(`UPDATE billing_accounts SET plan_id = 'professional' WHERE id = $1`, [ada.billingAccountId]);
    evidence = new EvidenceService(db.pool, undefined, undefined, { clock });
    admin = new AdminService(db.pool, new Set(['operator-verify']), clock);
  });

  afterAll(async () => {
    if (db) await db.drop();
  });

  it('accepts only http and https links', async () => {
    const bad = await evidence.create(ada, { title: 'XSS', evidenceType: 'project', attachmentUrl: 'javascript:alert(1)' }).catch((e: unknown) => e);
    expect(isBillingError(bad, 'validation_error')).toBe(true);
    const item = await evidence.create(ada, { title: 'Repo', evidenceType: 'project', attachmentUrl: 'https://example.test/repo' });
    expect(item.evidenceLabel).toBe('evidence_attached');
    const badUpdate = await evidence.update(ada, item.id, { attachmentUrl: 'data:text/html,hi' }).catch((e: unknown) => e);
    expect(isBillingError(badUpdate, 'validation_error')).toBe(true);
    // Clearing the only attachment drops "evidence attached".
    const cleared = await evidence.update(ada, item.id, { attachmentUrl: null });
    expect(cleared).toMatchObject({ attachmentUrl: null, evidenceLabel: 'self_reported' });
  });

  it('links facts the person owns, and asks for a redaction confirmation before sharing confidential material', async () => {
    const fact = await db.pool.query<{ id: string }>(
      `INSERT INTO career_facts (workspace_id, candidate_auth_user_id, fact_type, value, source, confirmation, uncertain)
       VALUES ($1, $2, 'skill', '{"name":"SQL"}', 'manual', 'draft', '{}') RETURNING id`,
      [ada.workspaceId, ada.authUserId],
    );
    const linked = await evidence.create(ada, { title: 'Report', evidenceType: 'work_sample', linkedFactIds: [fact.rows[0].id] });
    expect(linked.linkedFactIds).toEqual([fact.rows[0].id]);
    const foreign = await evidence.update(ada, linked.id, { linkedFactIds: ['00000000-0000-4000-8000-000000000001'] }).catch((e: unknown) => e);
    expect(isBillingError(foreign, 'validation_error')).toBe(true);

    const blocked = await evidence.update(ada, linked.id, { confidential: true, isPortfolioShared: true }).catch((e: unknown) => e);
    expect(isBillingError(blocked, 'validation_error')).toBe(true);
    const shared = await evidence.update(ada, linked.id, {
      confidential: true,
      isPortfolioShared: true,
      redactionNote: 'Client names blurred',
      redactionConfirmed: true,
    });
    expect(shared).toMatchObject({ confidential: true, isPortfolioShared: true, redactionNote: 'Client names blurred' });
    expect(shared.redactionConfirmedAt).not.toBeNull();
  });

  it('records operator checks with history; expiry and revocation lower the label again', async () => {
    const credential = await evidence.create(ada, { title: 'AWS certificate', evidenceType: 'credential', attachmentUrl: 'https://example.test/cert.pdf' });
    expect(credential.evidenceLabel).toBe('evidence_attached');

    const notOperator = await admin.recordEvidenceVerification(ada, credential.id, {}).catch((e: unknown) => e);
    expect(isBillingError(notOperator, 'permission_denied')).toBe(true);

    const base = {
      label: 'issuer_verified' as const,
      method: 'issuer_registry' as const,
      checkedOn: '2026-11-10',
      scope: 'Certificate number and holder name',
      issuerName: 'Amazon Web Services',
      permissionEvidence: 'Holder consent recorded 2026-11-09',
    };
    const missing = await admin.recordEvidenceVerification(operator, credential.id, { ...base, permissionEvidence: '' }).catch((e: unknown) => e);
    expect(isBillingError(missing, 'validation_error')).toBe(true);
    const wrongKind = await admin.recordEvidenceVerification(operator, credential.id, { ...base, label: 'reference_confirmed' }).catch((e: unknown) => e);
    expect(isBillingError(wrongKind, 'validation_error')).toBe(true);
    const future = await admin.recordEvidenceVerification(operator, credential.id, { ...base, checkedOn: '2026-12-01' }).catch((e: unknown) => e);
    expect(isBillingError(future, 'validation_error')).toBe(true);

    const recorded = await admin.recordEvidenceVerification(operator, credential.id, { ...base, expiresOn: '2026-12-31' });
    expect(recorded.evidenceLabel).toBe('issuer_verified');
    const mine = await evidence.get(ada, credential.id);
    expect(mine.evidenceLabel).toBe('issuer_verified');
    expect(mine.verifications).toHaveLength(1);
    expect(mine.verifications[0]).toMatchObject({ method: 'issuer_registry', scope: base.scope, active: true });

    clock.set('2027-01-02T10:00:00Z');
    const expired = await evidence.get(ada, credential.id);
    expect(expired.evidenceLabel).toBe('evidence_attached');
    expect(expired.verifications[0].active).toBe(false);
    clock.set('2026-11-14T10:00:00Z');

    const revoked = await admin.revokeEvidenceVerification(operator, mine.verifications[0].id, 'Issuer withdrew the certificate');
    expect(revoked.evidenceLabel).toBe('evidence_attached');
    expect(revoked.verifications[0].revokedReason).toBe('Issuer withdrew the certificate');
    const audit = await db.pool.query<{ action: string }>(`SELECT action FROM admin_audit WHERE target IN ($1, $2) ORDER BY created_at`, [credential.id, mine.verifications[0].id]);
    expect(audit.rows.map((row) => row.action)).toEqual(['evidence.verify.issuer_verified', 'evidence.verify.revoke']);
  });
});
