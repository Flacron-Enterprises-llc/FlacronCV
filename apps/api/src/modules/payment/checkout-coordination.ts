import { randomUUID } from 'node:crypto';

/**
 * Durable per-user coordination of Stripe Checkout (plan subscriptions).
 *
 * One document per user, `checkout_coordination/{uid}`, written only inside
 * Firestore transactions. It answers three questions that an in-memory lock
 * cannot, because the API runs on several instances and a request can die
 * between a Stripe call and the Firestore write that records it:
 *
 *   1. Is another checkout for this user being created right now? (`lease`)
 *      A second concurrent request is refused with CHECKOUT_IN_PROGRESS
 *      instead of opening a second session. A lease left behind by a crashed
 *      request expires after {@link CHECKOUT_LEASE_MS} and is taken over.
 *   2. Which Checkout Session is currently open for this user, until when, and
 *      does it offer a free trial? (`sessionId`, `sessionExpiresAt`,
 *      `offersTrial`). The next request re-resolves that session against
 *      Stripe before creating a replacement, so at most one open session —
 *      and so at most one usable trial session — exists per user.
 *   3. Which Stripe idempotency keys belong to this attempt? (`generation`,
 *      `pendingCustomerKey`). Keys are derived from uid + generation; a
 *      customer key is kept until the customer id is saved, so a retry after a
 *      crash gets the SAME Stripe customer instead of an orphan.
 *
 * The record never grants anything: entitlements come only from verified
 * Stripe subscription data in the webhook / verifySession.
 */

export const CHECKOUT_COORDINATION_COLLECTION = 'checkout_coordination';

/** How long a request may hold the creation lease before it is presumed dead. */
export const CHECKOUT_LEASE_MS = 2 * 60 * 1000;

/**
 * Lifetime given to a Checkout Session (`expires_at`). Stripe's minimum is 30
 * minutes after creation; one extra minute absorbs request latency and clock
 * skew so the parameter is never rejected.
 */
export const CHECKOUT_SESSION_TTL_SECONDS = 31 * 60;

export type CheckoutCoordinationStatus = 'idle' | 'creating' | 'open';

export interface CheckoutCoordinationRecord {
  uid: string;
  /** Monotonically increasing; bumped by every acquisition. */
  generation: number;
  status: CheckoutCoordinationStatus;
  leaseId: string | null;
  /** Epoch milliseconds. */
  leaseUntil: number | null;
  /** The most recent session handed to the user (may since have completed/expired). */
  sessionId: string | null;
  /** Unix seconds. */
  sessionExpiresAt: number | null;
  offersTrial: boolean;
  /** Idempotency key of a customers.create whose result is not saved yet. */
  pendingCustomerKey: string | null;
  updatedAt: Date;
}

export interface CheckoutLease {
  uid: string;
  generation: number;
  leaseId: string;
  /** True when this request took over a lease abandoned mid-creation. */
  takeover: boolean;
  previous: { sessionId: string | null; sessionExpiresAt: number | null; offersTrial: boolean };
}

/** Another checkout for this user is being created right now. */
export class CheckoutInProgressError extends Error {}

/** The minimal Firestore surface used here (real SDK and InMemoryFirestore both satisfy it). */
interface TxLike {
  get(ref: unknown): Promise<{ exists: boolean; data(): unknown }>;
  set(ref: unknown, data: Record<string, unknown>, options?: { merge?: boolean }): unknown;
}
export interface DbLike {
  collection(name: string): { doc(id: string): unknown };
  runTransaction<T>(fn: (tx: TxLike) => Promise<T>): Promise<T>;
}

export function sessionIdempotencyKey(lease: Pick<CheckoutLease, 'uid' | 'generation'>): string {
  return `flacroncv-checkout-${lease.uid}-${lease.generation}`;
}

export function customerIdempotencyKey(uid: string, generation: number): string {
  return `flacroncv-customer-${uid}-${generation}`;
}

export class CheckoutCoordinator {
  constructor(
    private readonly db: () => DbLike,
    private readonly now: () => number = () => Date.now(),
  ) {}

  private ref(uid: string) {
    return this.db().collection(CHECKOUT_COORDINATION_COLLECTION).doc(uid);
  }

  private static read(snap: { exists: boolean; data(): unknown }): Partial<CheckoutCoordinationRecord> {
    return snap.exists ? ((snap.data() as Partial<CheckoutCoordinationRecord>) ?? {}) : {};
  }

  /** Take the creation lease, or throw {@link CheckoutInProgressError}. */
  async acquire(uid: string): Promise<CheckoutLease> {
    const ref = this.ref(uid);
    return this.db().runTransaction(async (tx) => {
      const rec = CheckoutCoordinator.read(await tx.get(ref));
      const now = this.now();
      const leaseLive = rec.status === 'creating' && typeof rec.leaseUntil === 'number' && rec.leaseUntil > now;
      if (leaseLive) throw new CheckoutInProgressError(`Checkout already being created for ${uid}`);

      const generation = (typeof rec.generation === 'number' ? rec.generation : 0) + 1;
      const leaseId = randomUUID();
      tx.set(
        ref,
        {
          uid,
          generation,
          status: 'creating',
          leaseId,
          leaseUntil: now + CHECKOUT_LEASE_MS,
          sessionId: rec.sessionId ?? null,
          sessionExpiresAt: rec.sessionExpiresAt ?? null,
          offersTrial: !!rec.offersTrial,
          pendingCustomerKey: rec.pendingCustomerKey ?? null,
          updatedAt: new Date(now),
        },
        { merge: true },
      );
      return {
        uid,
        generation,
        leaseId,
        takeover: rec.status === 'creating',
        previous: {
          sessionId: rec.sessionId ?? null,
          sessionExpiresAt: rec.sessionExpiresAt ?? null,
          offersTrial: !!rec.offersTrial,
        },
      };
    });
  }

  /**
   * The idempotency key for creating this user's Stripe customer. A key left
   * by a request that died before saving the customer is REUSED, so Stripe
   * returns that same customer rather than creating a second one.
   */
  async reserveCustomerKey(lease: CheckoutLease): Promise<string> {
    const ref = this.ref(lease.uid);
    return this.db().runTransaction(async (tx) => {
      const rec = CheckoutCoordinator.read(await tx.get(ref));
      if (rec.pendingCustomerKey) return rec.pendingCustomerKey;
      const key = customerIdempotencyKey(lease.uid, lease.generation);
      tx.set(ref, { pendingCustomerKey: key, updatedAt: new Date(this.now()) }, { merge: true });
      return key;
    });
  }

  /** The customer id is saved: the next missing-customer case needs a fresh key. */
  async clearCustomerKey(lease: CheckoutLease): Promise<void> {
    const ref = this.ref(lease.uid);
    await this.db().runTransaction(async (tx) => {
      tx.set(ref, { pendingCustomerKey: null, updatedAt: new Date(this.now()) }, { merge: true });
    });
  }

  /**
   * Record the new open session. Returns false when this request no longer
   * holds the lease (it expired and another request took over): the caller
   * must then discard the session it created.
   */
  async commit(
    lease: CheckoutLease,
    session: { sessionId: string; sessionExpiresAt: number | null; offersTrial: boolean },
  ): Promise<boolean> {
    const ref = this.ref(lease.uid);
    return this.db().runTransaction(async (tx) => {
      const rec = CheckoutCoordinator.read(await tx.get(ref));
      if (rec.leaseId !== lease.leaseId || rec.status !== 'creating') return false;
      tx.set(
        ref,
        {
          status: 'open',
          leaseId: null,
          leaseUntil: null,
          sessionId: session.sessionId,
          sessionExpiresAt: session.sessionExpiresAt,
          offersTrial: session.offersTrial,
          updatedAt: new Date(this.now()),
        },
        { merge: true },
      );
      return true;
    });
  }

  /**
   * Give the lease back after a failure. The recorded session id is kept: the
   * next request re-resolves it against Stripe, whatever state it is in.
   */
  async release(lease: CheckoutLease): Promise<void> {
    const ref = this.ref(lease.uid);
    await this.db().runTransaction(async (tx) => {
      const rec = CheckoutCoordinator.read(await tx.get(ref));
      if (rec.leaseId !== lease.leaseId) return;
      tx.set(ref, { status: 'idle', leaseId: null, leaseUntil: null, updatedAt: new Date(this.now()) }, { merge: true });
    });
  }

  /**
   * `checkout.session.expired`: forget the pending session ONLY if it is the
   * one currently recorded. An old, superseded session expiring must never
   * clear a newer pending one. Returns whether anything was cleared.
   */
  async clearIfCurrent(uid: string, sessionId: string): Promise<boolean> {
    const ref = this.ref(uid);
    return this.db().runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return false;
      const rec = CheckoutCoordinator.read(snap);
      if (!sessionId || rec.sessionId !== sessionId) return false;
      tx.set(
        ref,
        {
          // A creation in flight keeps its lease; only the session fields go.
          ...(rec.status === 'creating' ? {} : { status: 'idle' }),
          sessionId: null,
          sessionExpiresAt: null,
          offersTrial: false,
          updatedAt: new Date(this.now()),
        },
        { merge: true },
      );
      return true;
    });
  }

  async get(uid: string): Promise<Partial<CheckoutCoordinationRecord> | null> {
    const ref = this.ref(uid);
    return this.db().runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      return snap.exists ? CheckoutCoordinator.read(snap) : null;
    });
  }
}
