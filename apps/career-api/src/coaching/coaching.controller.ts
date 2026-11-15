import { Body, Controller, Delete, Get, Inject, Param, Post, Provider } from '@nestjs/common';
import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { CoachingService, MeteringService } from '@flacroncv/career-server';
import type { Principal, TextModel } from '@flacroncv/career-server';
import { COACH_LOCALES, MAX_COACH_QUESTION } from '@flacroncv/career-shared';
import { TEXT_MODEL } from '../ai/ai.providers';
import { CurrentPrincipal } from '../auth/auth.guard';
import { DatabaseService } from '../database/database.service';
import { IdempotencyKey } from '../metering/metering.providers';

/** One question. No threadId starts a conversation; opportunityId only on a new one (the service checks). */
class AskDto {
  @IsString()
  @MaxLength(MAX_COACH_QUESTION + 200)
  question!: string;

  @IsOptional()
  @IsUUID()
  threadId?: string;

  @IsOptional()
  @IsUUID()
  opportunityId?: string;

  @IsOptional()
  @IsIn(COACH_LOCALES)
  locale?: string;
}

export const coachingProviders: Provider[] = [
  {
    provide: CoachingService,
    inject: [DatabaseService, TEXT_MODEL, MeteringService],
    useFactory: (database: DatabaseService, model: TextModel, metering: MeteringService) =>
      new CoachingService(database.connectionPool, model, metering),
  },
];

/** Career coach (spec section 26). Each reply spends one coaching_response. */
@Controller()
export class CoachingController {
  constructor(@Inject(CoachingService) private readonly coaching: CoachingService) {}

  @Get('coaching')
  list(@CurrentPrincipal() principal: Principal) {
    return this.coaching.list(principal);
  }

  @Post('coaching')
  async ask(
    @CurrentPrincipal() principal: Principal,
    @Body() body: AskDto,
    @IdempotencyKey() idempotencyKey: string | undefined,
  ) {
    const out = await this.coaching.ask(principal, body, idempotencyKey);
    return {
      thread: out.result,
      usage: { ...out.usage, renewalDate: out.usage.renewalDate.toISOString() },
      jobId: out.jobId,
      replayed: out.replayed,
    };
  }

  @Get('coaching/:threadId')
  get(@CurrentPrincipal() principal: Principal, @Param('threadId') threadId: string) {
    return this.coaching.get(principal, threadId);
  }

  @Delete('coaching/:threadId')
  remove(@CurrentPrincipal() principal: Principal, @Param('threadId') threadId: string) {
    return this.coaching.remove(principal, threadId);
  }
}
