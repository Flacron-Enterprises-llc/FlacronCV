import { Body, Controller, Get, Inject, Param, Post, Query, Provider } from '@nestjs/common';
import { IsIn, IsOptional, IsUUID } from 'class-validator';
import { MatchService, MeteringService } from '@flacroncv/career-server';
import type { Principal } from '@flacroncv/career-server';
import { CurrentPrincipal } from '../auth/auth.guard';
import { DatabaseService } from '../database/database.service';
import { IdempotencyKey } from '../metering/metering.providers';

class CompareDto {
  @IsUUID()
  resumeVersionId!: string;

  @IsUUID()
  opportunityId!: string;

  @IsOptional()
  @IsIn(['explicit'])
  mode?: string;
}

class FindQuery {
  @IsUUID()
  opportunityId!: string;

  @IsUUID()
  resumeVersionId!: string;
}

export const matchProviders: Provider[] = [
  {
    provide: MatchService,
    inject: [DatabaseService, MeteringService],
    useFactory: (database: DatabaseService, metering: MeteringService) => new MatchService(database.connectionPool, metering),
  },
];

@Controller()
export class MatchingController {
  constructor(@Inject(MatchService) private readonly matches: MatchService) {}

  @Get('analyses/:analysisId')
  get(@CurrentPrincipal() principal: Principal, @Param('analysisId') analysisId: string) {
    return this.matches.get(principal, analysisId);
  }

  @Get('matches')
  find(@CurrentPrincipal() principal: Principal, @Query() query: FindQuery) {
    return this.matches.find(principal, query);
  }

  @Post('analyses')
  analyse(
    @CurrentPrincipal() principal: Principal,
    @Body() body: CompareDto,
    @IdempotencyKey() idempotencyKey: string | undefined,
  ) {
    return this.matches.compare(principal, body, idempotencyKey, false);
  }

  @Post('matches')
  match(
    @CurrentPrincipal() principal: Principal,
    @Body() body: CompareDto,
    @IdempotencyKey() idempotencyKey: string | undefined,
  ) {
    return this.matches.compare(principal, { ...body, mode: body.mode }, idempotencyKey, true);
  }
}
