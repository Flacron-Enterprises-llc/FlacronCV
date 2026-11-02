import { createParamDecorator, ExecutionContext, Provider } from '@nestjs/common';
import type { Request } from 'express';
import { MeteringService } from '@flacroncv/career-server';
import { DatabaseService } from '../database/database.service';

export const meteringProviders: Provider[] = [
  {
    provide: MeteringService,
    inject: [DatabaseService],
    useFactory: (database: DatabaseService) => new MeteringService(database.connectionPool),
  },
];

/** The `Idempotency-Key` header, or undefined. A charging route passes it to `MeteringService.run`, which requires it. */
export const IdempotencyKey = createParamDecorator((_data: unknown, context: ExecutionContext): string | undefined => {
  const value = context.switchToHttp().getRequest<Request>().headers['idempotency-key'];
  return typeof value === 'string' ? value : undefined;
});
