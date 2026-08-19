import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, from, lastValueFrom } from 'rxjs';
import { AbuseService } from '../../modules/abuse/abuse.service';

/**
 * Applies Idempotency-Key on AI generate paths. Missing/invalid keys run the
 * handler as usual. Never logs the key.
 */
@Injectable()
export class AbuseIdempotencyInterceptor implements NestInterceptor {
  constructor(private abuse: AbuseService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<{
      user?: { uid?: string };
      headers: Record<string, string | string[] | undefined>;
    }>();
    const uid = req.user?.uid;
    const raw = req.headers['idempotency-key'];
    const key = Array.isArray(raw) ? raw[0] : raw;
    if (!uid) return next.handle();
    return from(
      this.abuse.withIdempotency(uid, typeof key === 'string' ? key : undefined, () =>
        lastValueFrom(next.handle()),
      ),
    );
  }
}
