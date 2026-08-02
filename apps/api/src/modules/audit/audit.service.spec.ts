import { AuditService } from './audit.service';
import { AuditAction } from './audit-actions';
import { InMemoryFirestore } from '../firebase/in-memory-firestore';

function makeService() {
  const firestore = new InMemoryFirestore();
  const service = new AuditService({ firestore } as any);
  return { service, firestore };
}

async function rows(firestore: InMemoryFirestore) {
  const snap = await firestore.collection('audit_logs').get();
  return snap.docs.map((d: any) => d.data());
}

describe('AuditService', () => {
  /**
   * Firestore REJECTS any write containing `undefined`, and log() deliberately
   * swallows its own errors so auditing can never break the action it records.
   * Together those mean an undefined field silently loses the row — the worst
   * failure mode for an audit trail. Callers legitimately pass optionals
   * (req.ip on a local socket, a user with no email, unset metadata), so the
   * service normalises them.
   */
  describe('undefined normalisation', () => {
    it('converts undefined top-level fields to null', async () => {
      const { service, firestore } = makeService();

      await service.log({
        actorId: 'u1',
        actorEmail: 'a@example.com',
        actorRole: 'user',
        action: AuditAction.LOGIN,
        resource: 'user',
        resourceId: 'u1',
        ipAddress: undefined,
        userAgent: undefined,
      });

      const [row] = await rows(firestore);
      expect(row).toBeDefined();
      expect(row.ipAddress).toBeNull();
      expect(row.userAgent).toBeNull();
      expect(JSON.stringify(row)).not.toContain('undefined');
    });

    it('converts undefined NESTED metadata values to null', async () => {
      const { service, firestore } = makeService();

      await service.log({
        actorId: 'u1',
        actorEmail: 'a@example.com',
        actorRole: 'admin',
        action: AuditAction.TEMPLATE_DELETED,
        resource: 'template',
        resourceId: 't1',
        metadata: { name: undefined, archived: true, nested: { deep: undefined } },
      });

      const [row] = await rows(firestore);
      expect(row.metadata.name).toBeNull();
      expect(row.metadata.archived).toBe(true);
      expect(row.metadata.nested.deep).toBeNull();
    });

    it('preserves Date values rather than walking into them as plain objects', async () => {
      // The sanitizer recurses through objects, so a Date must be special-cased
      // or it would be flattened to `{}` and the timestamp lost. (The in-memory
      // test store serialises Dates to ISO strings on write, which is why this
      // asserts "a usable instant" rather than `instanceof Date`.)
      const { service, firestore } = makeService();
      await service.logSystemAction(AuditAction.SUBSCRIPTION_ACTIVATED, 'subscription', 'u1');
      const [row] = await rows(firestore);
      expect(row.createdAt).toBeTruthy();
      expect(typeof row.createdAt).not.toBe('object');
      expect(Number.isNaN(new Date(row.createdAt).getTime())).toBe(false);
    });

    it('records changes as null when absent, not undefined', async () => {
      const { service, firestore } = makeService();
      await service.logUserAction(AuditAction.LOGOUT, { uid: 'u1' }, 'user', 'u1');
      const [row] = await rows(firestore);
      expect(row.changes).toBeNull();
      expect('changes' in row).toBe(true);
    });

    it('keeps a real before/after diff intact', async () => {
      const { service, firestore } = makeService();
      await service.log({
        actorId: 'boss',
        actorEmail: 'boss@example.com',
        actorRole: 'super_admin',
        action: AuditAction.USER_ROLE_CHANGED,
        resource: 'user',
        resourceId: 'target',
        changes: { before: { role: 'user' }, after: { role: 'admin' } },
      });
      const [row] = await rows(firestore);
      expect(row.changes).toEqual({ before: { role: 'user' }, after: { role: 'admin' } });
    });
  });

  it('never throws, so a broken audit cannot fail the action it records', async () => {
    const exploding = {
      firestore: {
        collection: () => ({
          doc: () => ({
            set: () => Promise.reject(new Error('firestore down')),
          }),
        }),
      },
    } as any;
    const service = new AuditService(exploding);

    await expect(
      service.logUserAction(AuditAction.LOGIN, { uid: 'u1' }, 'user', 'u1'),
    ).resolves.toBeUndefined();
  });

  it('defaults a missing actor email/role rather than writing undefined', async () => {
    const { service, firestore } = makeService();
    await service.logUserAction(AuditAction.AI_GENERATION, { uid: 'u1' }, 'ai', 'cv-summary');
    const [row] = await rows(firestore);
    expect(row.actorEmail).toBe('unknown');
    expect(row.actorRole).toBe('user');
  });
});
