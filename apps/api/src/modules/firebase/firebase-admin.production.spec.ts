import { FirebaseAdminService } from './firebase-admin.service';

/**
 * The in-memory Firestore must never serve production traffic.
 *
 * `onModuleInit` probes Firestore once with `listCollections()`. That probe used
 * to fall back to an in-memory store on ANY failure, with no environment guard,
 * no retry, and no way back — the `firestore` getter consults the flag on every
 * later call for the lifetime of the process. A transient DNS blip, cold-start
 * timeout, momentary IAM/quota error or Google 503 at that one instant was
 * enough to flip it.
 *
 * The process then started cleanly and `/health` returned a static
 * `{status:'ok'}` with no datastore probe, so the load balancer sent it live
 * traffic. And because `auth` does NOT consult the flag — it always reaches
 * real Firebase Auth — users signed in successfully, found an empty store, and
 * had a blank free-tier account silently recreated over the top: existing CVs
 * and paid subscriptions invisible, every write discarded on restart, including
 * Stripe webhook plan grants that Stripe will not redeliver once the event is
 * recorded as processed.
 *
 * Dying at boot is strictly better: the deploy rolls back or the container
 * restarts against a healthy Firestore.
 *
 * These tests drive `failFastOrFallBack` — the decision itself — rather than
 * `onModuleInit`. The lifecycle hook resolves real credentials before it
 * reaches the probe (it calls `initializeApp()`, or adopts an already-created
 * `admin.apps[0]`), so exercising it here would contact real Firebase. The
 * environment guard is the behaviour under test and it lives in this method.
 */
describe('FirebaseAdminService — in-memory fallback is dev-only', () => {
  const makeConfig = (nodeEnv: string | undefined) =>
    ({ get: jest.fn((key: string) => (key === 'nodeEnv' ? nodeEnv : undefined)) }) as never;

  type Guarded = { failFastOrFallBack(reason: string): void };
  type Internals = { _useInMemory: boolean; _inMemoryFirestore: unknown };

  const ORIGINAL_NODE_ENV = process.env.NODE_ENV;
  afterEach(() => {
    process.env.NODE_ENV = ORIGINAL_NODE_ENV;
  });

  it('refuses to start in production instead of silently serving an empty store', () => {
    process.env.NODE_ENV = 'production';
    const service = new FirebaseAdminService(makeConfig('production'));

    expect(() => (service as never as Guarded).failFastOrFallBack('Firestore not accessible: ECONNRESET')).toThrow(
      /refusing to start in production/i,
    );

    // And it must NOT have armed the in-memory store on the way out.
    expect((service as never as Internals)._useInMemory).toBe(false);
  });

  it('still falls back to the in-memory store in development', () => {
    process.env.NODE_ENV = 'development';
    const service = new FirebaseAdminService(makeConfig('development'));

    expect(() =>
      (service as never as Guarded).failFastOrFallBack('Firestore not accessible: ECONNRESET'),
    ).not.toThrow();

    expect((service as never as Internals)._useInMemory).toBe(true);
    expect(service.firestore.collection).toBeInstanceOf(Function);
  });

  /**
   * ConfigService is the primary source, but the guard must still hold if
   * `nodeEnv` is not wired into config for some reason — otherwise the
   * production protection silently disappears.
   */
  it('treats NODE_ENV=production as production even when config does not supply nodeEnv', () => {
    process.env.NODE_ENV = 'production';
    const service = new FirebaseAdminService(makeConfig(undefined));

    expect(() => (service as never as Guarded).failFastOrFallBack('Firebase Admin is not configured.')).toThrow(
      /refusing to start in production/i,
    );
  });
});
