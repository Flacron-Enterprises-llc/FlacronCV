import { AsyncLocalStorage } from 'async_hooks';
import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';

/**
 * The signed-in caller of the current HTTP request, so the career ledger
 * meter can act on behalf of that person with their OWN ID token (the career
 * service verifies it and can only ever spend that person's pool). Kept in
 * AsyncLocalStorage so AI services keep their `userId` signatures. Never
 * logged, never stored.
 */
export interface CallerContext {
  /** The raw bearer token of the request (Firebase ID token). */
  idToken: string;
  /** `request.user.uid` from FirebaseAuthGuard. */
  uid: string | null;
  /** The request's Idempotency-Key header, if any. */
  idempotencyKey: string | null;
}

const storage = new AsyncLocalStorage<CallerContext>();

export function currentCaller(): CallerContext | null {
  return storage.getStore() ?? null;
}

/** For tests and non-HTTP callers. */
export function runWithCaller<T>(context: CallerContext, fn: () => T): T {
  return storage.run(context, fn);
}

/**
 * Global interceptor (runs after guards). Puts the bearer token and the
 * guard-verified uid in context for the handler's whole async execution.
 */
@Injectable()
export class CallerContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const request = context.switchToHttp().getRequest<{
      headers?: Record<string, string | string[] | undefined>;
      user?: { uid?: string };
    }>();
    const header = request?.headers?.authorization;
    const match = typeof header === 'string' ? /^Bearer ([^\s]+)$/.exec(header) : null;
    if (!match) return next.handle();
    const rawKey = request.headers?.['idempotency-key'];
    const key = Array.isArray(rawKey) ? rawKey[0] : rawKey;
    const caller: CallerContext = {
      idToken: match[1],
      uid: request.user?.uid ?? null,
      idempotencyKey: typeof key === 'string' && key.trim() ? key.trim().slice(0, 200) : null,
    };
    return new Observable((subscriber) =>
      storage.run(caller, () => {
        const subscription = next.handle().subscribe(subscriber);
        return () => subscription.unsubscribe();
      }),
    );
  }
}
