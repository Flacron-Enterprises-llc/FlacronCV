import { Body, Controller, Get, Inject, Param, Post, Query, Provider } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { OpportunityService, OpportunityTrustService } from '@flacroncv/career-server';
import type { Principal } from '@flacroncv/career-server';
import type { ReportReason } from '@flacroncv/career-shared';
import { CurrentPrincipal } from '../auth/auth.guard';
import { DatabaseService } from '../database/database.service';

class SearchQuery {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  category?: string;

  @IsOptional()
  @IsString()
  @MaxLength(16)
  status?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10000)
  radiusMiles?: number;
}

class PasteDto {
  @IsString()
  @MaxLength(20000)
  text!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  sourceUrl?: string;
}

class ReportOpportunityDto {
  @IsString()
  @IsIn(['suspicious_fee', 'misleading', 'expired_closed', 'duplicate', 'scam', 'other'])
  reason!: ReportReason;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export const opportunityProviders: Provider[] = [
  {
    provide: OpportunityService,
    inject: [DatabaseService],
    useFactory: (database: DatabaseService) => new OpportunityService(database.connectionPool),
  },
];

@Controller()
export class OpportunitiesController {
  constructor(
    @Inject(OpportunityService) private readonly opportunities: OpportunityService,
    @Inject(OpportunityTrustService) private readonly trustService: OpportunityTrustService,
  ) {}

  @Get('opportunities')
  search(@CurrentPrincipal() principal: Principal, @Query() query: SearchQuery) {
    return this.opportunities.search(principal, query);
  }

  @Post('opportunities')
  paste(@CurrentPrincipal() principal: Principal, @Body() body: PasteDto) {
    return this.opportunities.paste(principal, body);
  }

  @Get('opportunities/:opportunityId')
  get(@CurrentPrincipal() principal: Principal, @Param('opportunityId') opportunityId: string) {
    return this.opportunities.get(principal, opportunityId);
  }

  @Post('opportunities/:opportunityId/report')
  report(
    @CurrentPrincipal() principal: Principal,
    @Param('opportunityId') opportunityId: string,
    @Body() body: ReportOpportunityDto,
  ) {
    return this.trustService.reportListing(principal, opportunityId, body);
  }

  @Get('opportunities/:opportunityId/trust')
  trust(
    @CurrentPrincipal() principal: Principal,
    @Param('opportunityId') opportunityId: string,
  ) {
    return this.trustService.getTrustSignals(principal, opportunityId);
  }
}
