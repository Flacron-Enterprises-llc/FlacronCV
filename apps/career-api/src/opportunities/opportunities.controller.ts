import { Body, Controller, Delete, Get, Inject, Param, Post, Put, Query, Provider } from '@nestjs/common';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsNumber, IsObject, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { OpportunityService, OpportunityTrustService, createGeocoder } from '@flacroncv/career-server';
import type { Principal } from '@flacroncv/career-server';
import { LISTING_SCHEDULES, LISTING_SENIORITIES, OPPORTUNITY_CATEGORIES, OPPORTUNITY_FILTER_CATEGORIES } from '@flacroncv/career-shared';
import type { ReportReason } from '@flacroncv/career-shared';
import { CurrentPrincipal } from '../auth/auth.guard';
import { DatabaseService } from '../database/database.service';

/** Query strings carry "true"/"false"; anything else is left for the validator to refuse. */
const toBoolean = ({ value }: { value: unknown }) => (value === 'true' || value === true ? true : value === 'false' || value === false ? false : value);

class SearchQuery {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  role?: string;

  @IsOptional()
  @IsIn([...OPPORTUNITY_FILTER_CATEGORIES])
  category?: string;

  @IsOptional()
  @IsString()
  @MaxLength(16)
  status?: string;

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  includeExpired?: boolean;

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  payStated?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100_000_000)
  minPay?: number;

  @IsOptional()
  @Matches(/^[A-Za-z]{3}$/)
  payCurrency?: string;

  @IsOptional()
  @IsIn(['hour', 'day', 'week', 'month', 'year'])
  payPeriod?: string;

  @IsOptional()
  @IsIn([...LISTING_SCHEDULES])
  schedule?: string;

  @IsOptional()
  @IsIn([...LISTING_SENIORITIES])
  seniority?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  place?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10000)
  radiusMiles?: number;

  @IsOptional()
  @IsIn(['restricted', 'unrestricted'])
  remote?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(3650)
  postedWithinDays?: number;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  deadlineBefore?: string;

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  followedOnly?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  provider?: string;
}

class PasteDto {
  @IsString()
  @MaxLength(20000)
  text!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  sourceUrl?: string;

  @IsOptional()
  @IsIn([...OPPORTUNITY_CATEGORIES])
  category?: string;

  @IsOptional()
  @Matches(/^(\d{4}-\d{2}-\d{2})?$/)
  deadline?: string;

  @IsOptional()
  @Matches(/^(\d{4}-\d{2}-\d{2})?$/)
  publishedAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  remoteRestriction?: string;

  /** Category-specific fields as the person types them; each value is checked and clipped by the service. */
  @IsOptional()
  @IsObject()
  details?: Record<string, string | null>;
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
    // The geocoder stays unconfigured without GEOCODING_PROVIDER and a key; a radius is then reported as not applied.
    useFactory: (database: DatabaseService) =>
      new OpportunityService(database.connectionPool, undefined, undefined, createGeocoder(process.env)),
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

  @Get('saved-opportunities')
  saved(@CurrentPrincipal() principal: Principal) {
    return this.opportunities.saved(principal);
  }

  @Put('saved-opportunities/:opportunityId')
  save(@CurrentPrincipal() principal: Principal, @Param('opportunityId') opportunityId: string) {
    return this.opportunities.save(principal, opportunityId);
  }

  @Delete('saved-opportunities/:opportunityId')
  unsave(@CurrentPrincipal() principal: Principal, @Param('opportunityId') opportunityId: string) {
    return this.opportunities.unsave(principal, opportunityId);
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
