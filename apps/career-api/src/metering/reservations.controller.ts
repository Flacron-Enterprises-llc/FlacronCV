import { Body, Controller, Get, HttpCode, Inject, Param, ParseUUIDPipe, Post, Provider } from '@nestjs/common';
import { IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { RemoteMeteringService, V1_METERED_UNITS } from '@flacroncv/career-server';
import type { Principal } from '@flacroncv/career-server';
import { CurrentPrincipal } from '../auth/auth.guard';
import { DatabaseService } from '../database/database.service';
import { IdempotencyKey } from './metering.providers';

class ReserveDto {
  @IsIn(V1_METERED_UNITS as unknown as string[])
  unit!: string;

  /** What V1 is doing, e.g. `ai.generate` or `ai.ats-check`. Part of the idempotency fingerprint. */
  @IsString()
  @Matches(/^[a-z0-9][a-z0-9._-]{0,47}$/)
  operation!: string;

  /** How long the reservation may stay open (30 to 900 seconds; default 300). */
  @IsOptional()
  @IsInt()
  @Min(30)
  @Max(900)
  ttlSeconds?: number;
}

class ReleaseDto {
  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9_]{1,48}$/)
  @MaxLength(48)
  reason?: string;
}

export const reservationProviders: Provider[] = [
  {
    provide: RemoteMeteringService,
    inject: [DatabaseService],
    useFactory: (database: DatabaseService) => new RemoteMeteringService(database.connectionPool),
  },
];

/**
 * Unified metering for V1's own AI endpoints (PLAN_CONTRACT "Metering").
 * V1 calls these server-to-server with the signed-in person's own ID token,
 * so the guard resolves the same principal and V1 can only ever spend that
 * person's pool. Document credits and résumé analyses are one ledger.
 *
 * Flow: reserve (Idempotency-Key required) → run the AI call → commit on
 * success, release on failure. An open reservation is released by the
 * worker sweep after its TTL.
 */
@Controller('metering/reservations')
export class ReservationsController {
  constructor(@Inject(RemoteMeteringService) private readonly meter: RemoteMeteringService) {}

  @Post()
  @HttpCode(201)
  reserve(@CurrentPrincipal() principal: Principal, @Body() body: ReserveDto, @IdempotencyKey() key: string | undefined) {
    return this.meter.reserve(principal, {
      unit: body.unit,
      operation: body.operation,
      idempotencyKey: key,
      ttlMs: body.ttlSeconds !== undefined ? body.ttlSeconds * 1000 : undefined,
    });
  }

  @Get(':id')
  get(@CurrentPrincipal() principal: Principal, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.meter.get(principal, id);
  }

  @Post(':id/commit')
  @HttpCode(200)
  commit(@CurrentPrincipal() principal: Principal, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.meter.commit(principal, id);
  }

  @Post(':id/release')
  @HttpCode(200)
  release(@CurrentPrincipal() principal: Principal, @Param('id', new ParseUUIDPipe()) id: string, @Body() body: ReleaseDto) {
    return this.meter.release(principal, id, body.reason ?? 'released');
  }
}
