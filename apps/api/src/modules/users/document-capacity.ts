import { PLAN_CONFIGS, SubscriptionPlan, resolveEffectivePlan, type User } from '@flacroncv/shared-types';

/** Document kinds with a plan capacity. */
export type DocumentKind = 'cvs' | 'coverLetters';

/** The Firestore surface used here (the admin SDK and the in-memory test double both fit). */
interface CountingFirestore {
  collection(name: string): {
    where(field: string, op: '==', value: unknown): {
      where(field: string, op: '==', value: unknown): { count(): { get(): Promise<{ data(): { count: number } }> } };
    };
  };
}

/** Live (not deleted) documents of one kind owned by `uid`. */
export async function countStoredDocuments(firestore: unknown, uid: string, kind: DocumentKind): Promise<number> {
  const snap = await (firestore as CountingFirestore)
    .collection(kind === 'cvs' ? 'cvs' : 'cover_letters')
    .where('userId', '==', uid)
    .where('deletedAt', '==', null)
    .count()
    .get();
  return snap.data().count;
}

/**
 * May this user create one more CV / cover letter?
 *
 * Legacy plans (Pro, Career Accelerator, Enterprise): creations counted in the
 * cycle (`usage.cvsCreated` / `usage.coverLettersCreated`) — unchanged.
 * Current plans (Free, Starter, Professional, Career Pro, Business): CAPACITY —
 * the documents stored now (not deleted). A downgraded or cancelled account
 * keeps every document it has; it only cannot add one while at or over
 * capacity.
 */
export async function canCreateDocument(
  firestore: unknown,
  user: Pick<User, 'uid' | 'subscription' | 'usage'>,
  kind: DocumentKind,
): Promise<boolean> {
  const config = PLAN_CONFIGS[resolveEffectivePlan(user.subscription)] ?? PLAN_CONFIGS[SubscriptionPlan.FREE];
  const limit = kind === 'cvs' ? config.limits.cvs : config.limits.coverLetters;
  if (limit === 'unlimited') return true;
  if (config.legacy) {
    const created = kind === 'cvs' ? user.usage?.cvsCreated : user.usage?.coverLettersCreated;
    return (created ?? 0) < limit;
  }
  return (await countStoredDocuments(firestore, user.uid, kind)) < limit;
}
