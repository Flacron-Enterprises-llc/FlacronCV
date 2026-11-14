import { App, cert, deleteApp, getApps, initializeApp } from 'firebase-admin/app';
import { Firestore, getFirestore } from 'firebase-admin/firestore';
import { resolveEffectivePlan } from '@flacroncv/shared-types';
import { careerStatusFromV1, deployEnv, isV1Plan } from '@flacroncv/career-server';
import type { CareerPurchase, V1AccountSnapshot, V1AccountSource, V1CapacitySubscription, V1PackPurchase } from '@flacroncv/career-server';
import type { ApplicationStatus } from '@flacroncv/career-shared';

/** Upper bound on tracker rows read for analytics; V1's own export caps collections at 500. */
const MAX_JOB_ROWS = 2000;

const APP_NAME = 'flacroncv-career-v1-reader';

/**
 * Reads the caller's V1 `users/{uid}` document. Read-only: the career service
 * never writes to V1's Firestore, so V1 stays the single owner of plans,
 * subscriptions and credits, and there is no synchronisation to reconcile.
 *
 * The plan is V1's *effective* plan (`resolveEffectivePlan`, the same rule
 * every V1 gate uses), so a lapsed or cancelled subscription is treated by
 * the career features exactly as V1 treats it.
 */
export class FirestoreV1AccountSource implements V1AccountSource {
  constructor(private readonly firestore: Firestore) {}

  async read(uid: string): Promise<V1AccountSnapshot | null> {
    const snapshot = await this.firestore.collection('users').doc(uid).get();
    if (!snapshot.exists) return null;
    const data = snapshot.data() ?? {};
    const plan = resolveEffectivePlan(data.subscription);
    const v1Plan = isV1Plan(plan) ? plan : 'free';
    const [packs, capacity] = await Promise.all([
      this.firestore.collection(V1_PACK_PURCHASES).where('uid', '==', uid).limit(MAX_PURCHASE_ROWS).get(),
      this.firestore.collection(V1_CAPACITY_SUBSCRIPTIONS).where('uid', '==', uid).limit(MAX_PURCHASE_ROWS).get(),
    ]);
    const sub = (data.subscription ?? {}) as Record<string, unknown>;
    return {
      uid,
      plan: v1Plan,
      active: data.isActive !== false && !data.deletedAt,
      careerPurchase: careerPurchaseOf(data.careerSubscription),
      billing: {
        accountCreatedAt: dateOf(data.createdAt),
        // Only a paid effective plan has a billing anniversary; a stale period on a Free label is ignored.
        periodStart: v1Plan === 'free' ? null : dateOf(sub.currentPeriodStart),
        periodEnd: v1Plan === 'free' ? null : dateOf(sub.currentPeriodEnd),
        status: typeof sub.status === 'string' ? sub.status : null,
        packPurchases: packs.docs.map((doc) => packPurchaseOf(doc.id, doc.data())).filter((p): p is V1PackPurchase => p !== null),
        capacity: capacity.docs.map((doc) => capacityOf(doc.data())).filter((c): c is V1CapacitySubscription => c !== null),
      },
    };
  }

  async jobStatuses(uid: string): Promise<ApplicationStatus[]> {
    const rows = await this.firestore.collection('job_applications').where('userId', '==', uid).limit(MAX_JOB_ROWS).get();
    const statuses: ApplicationStatus[] = [];
    for (const doc of rows.docs) {
      const data = doc.data();
      if (data.deletedAt) continue;
      const status = careerStatusFromV1(data.status);
      if (status) statuses.push(status);
    }
    return statuses;
  }
}

/**
 * Written only by V1's Stripe webhook handler (`CareerBillingService`):
 * one document per paid pack (id = Checkout Session or PaymentIntent id) and
 * one per capacity add-on subscription (id = Stripe subscription id).
 */
export const V1_PACK_PURCHASES = 'career_pack_purchases';
export const V1_CAPACITY_SUBSCRIPTIONS = 'career_capacity_subscriptions';
const MAX_PURCHASE_ROWS = 500;

function dateOf(value: unknown): Date | null {
  const v = value as { toDate?: () => Date } | Date | string | null | undefined;
  const date =
    v instanceof Date ? v : v && typeof v === 'object' && typeof v.toDate === 'function' ? v.toDate() : typeof v === 'string' ? new Date(v) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
}

/** A malformed record is skipped, never guessed into a grant. */
export function packPurchaseOf(id: string, raw: Record<string, unknown>): V1PackPurchase | null {
  const purchasedAt = dateOf(raw.purchasedAt);
  const status = raw.status;
  if (typeof raw.addonId !== 'string' || !purchasedAt || (status !== 'paid' && status !== 'refunded' && status !== 'disputed')) return null;
  return {
    purchaseRef: id,
    addonId: raw.addonId,
    purchasedAt,
    amountCents: typeof raw.amountCents === 'number' ? raw.amountCents : null,
    currency: typeof raw.currency === 'string' ? raw.currency : null,
    status,
    autoTopup: raw.autoTopup === true,
  };
}

export function capacityOf(raw: Record<string, unknown>): V1CapacitySubscription | null {
  if (typeof raw.addonId !== 'string' || typeof raw.status !== 'string') return null;
  const quantity = typeof raw.quantity === 'number' && Number.isInteger(raw.quantity) ? raw.quantity : 0;
  return { addonId: raw.addonId, quantity, status: raw.status, currentPeriodEnd: dateOf(raw.currentPeriodEnd) };
}

/** `users/{uid}.careerSubscription` as V1's webhook handler (or the labelled local seed) wrote it. */
function careerPurchaseOf(raw: unknown): CareerPurchase | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Record<string, unknown>;
  if (typeof value.plan !== 'string' || typeof value.status !== 'string') return null;
  const end = value.currentPeriodEnd as { toDate?: () => Date } | Date | string | null | undefined;
  const currentPeriodEnd =
    end instanceof Date ? end : end && typeof end === 'object' && typeof end.toDate === 'function' ? end.toDate() : typeof end === 'string' ? new Date(end) : null;
  return {
    plan: value.plan,
    status: value.status,
    currentPeriodEnd: currentPeriodEnd && !Number.isNaN(currentPeriodEnd.getTime()) ? currentPeriodEnd : null,
    source: typeof value.source === 'string' ? value.source : null,
  };
}

/** Fixed answers. Tests and the local demo without a Firestore emulator only. */
export class StaticV1AccountSource implements V1AccountSource {
  constructor(
    private readonly accounts: ReadonlyMap<string, V1AccountSnapshot>,
    /** V1 job statuses per uid. A uid with no entry has no V1 tracker (null). */
    private readonly jobs: ReadonlyMap<string, string[]> = new Map(),
  ) {}

  async read(uid: string): Promise<V1AccountSnapshot | null> {
    return this.accounts.get(uid) ?? null;
  }

  async jobStatuses(uid: string): Promise<ApplicationStatus[] | null> {
    const rows = this.jobs.get(uid);
    if (!rows) return null;
    return rows.map(careerStatusFromV1).filter((status): status is ApplicationStatus => status !== null);
  }
}

/**
 * The V1 reader for this process. Messages name variables, never values.
 *
 * - A hosted deployment reads V1's project with the runtime's credentials
 *   (the ECS task role / ADC, or `FIREBASE_CLIENT_EMAIL` + `FIREBASE_PRIVATE_KEY`).
 * - Anything else **must** use the Firestore emulator. firebase-admin falls
 *   back to real credentials when the emulator host is missing, which is how
 *   a V1 development run once read production; this refuses to boot instead.
 * - `V1_ACCOUNT_SOURCE=static` is accepted only outside a hosted deployment
 *   and only by tests (it answers "no V1 account" for everyone).
 */
export function createV1AccountSource(env: NodeJS.ProcessEnv = process.env): V1AccountSource {
  const mode = env.V1_ACCOUNT_SOURCE?.trim().toLowerCase() || 'firestore';
  const hosted = deployEnv(env) !== null;
  if (mode === 'static') {
    if (hosted) throw new Error('V1_ACCOUNT_SOURCE=static is not allowed in a hosted deployment');
    return new StaticV1AccountSource(new Map());
  }
  if (mode !== 'firestore') throw new Error('V1_ACCOUNT_SOURCE must be firestore or static');

  const projectId = env.FIREBASE_PROJECT_ID?.trim() ?? '';
  const emulator = env.FIRESTORE_EMULATOR_HOST?.trim() ?? '';
  if (!hosted) {
    if (!emulator) {
      throw new Error('FIRESTORE_EMULATOR_HOST is required outside a hosted deployment, so V1 production data cannot be read');
    }
    if (!projectId.startsWith('demo-')) {
      throw new Error('FIREBASE_PROJECT_ID must start with demo- when reading the Firestore emulator');
    }
  } else if (emulator) {
    throw new Error('A hosted deployment cannot use the Firestore emulator');
  }

  const existing = getApps().find((app) => app.name === APP_NAME);
  const app: App =
    existing ??
    initializeApp(
      hosted && env.FIREBASE_CLIENT_EMAIL?.trim() && env.FIREBASE_PRIVATE_KEY?.trim()
        ? {
            projectId,
            credential: cert({
              projectId,
              clientEmail: env.FIREBASE_CLIENT_EMAIL.trim(),
              privateKey: env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
            }),
          }
        : { projectId },
      APP_NAME,
    );
  return new FirestoreV1AccountSource(getFirestore(app));
}

/** For tests that create the Firestore source. */
export async function closeV1AccountApps(): Promise<void> {
  await Promise.all(getApps().filter((app) => app.name === APP_NAME).map((app) => deleteApp(app)));
}
