import { Body, Controller, Get, Inject, Param, Post, Provider, Put, Req } from '@nestjs/common';
import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsIn, IsInt, IsString, IsUUID, MaxLength, Min, ValidateIf, ValidateNested } from 'class-validator';
import type { Request } from 'express';
import { BillingError, MeteringService, RemainingService, UnconfiguredMapTiles, WindowRateLimit, createMailer } from '@flacroncv/career-server';
import type { Principal } from '@flacroncv/career-server';
import { MAX_SCENARIO_OPTIONS } from '@flacroncv/career-shared';
import { CurrentPrincipal, Public } from '../auth/auth.guard';
import { DatabaseService } from '../database/database.service';
import { IdempotencyKey } from '../metering/metering.providers';

function optionalInt({ value }: { value: unknown }): number | null {
  if (value === null || value === undefined || value === '') return null;
  return typeof value === 'number' ? value : Number(value);
}

class ScenarioOptionDto {
  @IsString()
  @MaxLength(120)
  name!: string;

  @Transform(optionalInt)
  @ValidateIf((_object, value) => value !== null)
  @IsInt()
  @Min(0)
  costCents!: number | null;

  @Transform(optionalInt)
  @ValidateIf((_object, value) => value !== null)
  @IsInt()
  @Min(0)
  months!: number | null;

  @IsString()
  @MaxLength(120)
  destination!: string;

  @Transform(optionalInt)
  @ValidateIf((_object, value) => value !== null)
  @IsInt()
  @Min(0)
  wageCents!: number | null;

  @IsIn(['user', 'estimate'])
  source!: 'user' | 'estimate';
}

class CreateScenarioDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_SCENARIO_OPTIONS)
  @ValidateNested({ each: true })
  @Type(() => ScenarioOptionDto)
  options!: ScenarioOptionDto[];
}

class CreateFormDto {
  @IsString()
  @MaxLength(200)
  site!: string;
}

class ReviewFormDto {
  @IsBoolean()
  confirmed!: boolean;
}

class TitleDto {
  @IsString()
  @MaxLength(200)
  title!: string;
}

class GoalDto {
  @IsString()
  @MaxLength(200)
  desiredTitle!: string;
}

class CredentialDto {
  @IsString()
  @MaxLength(200)
  name!: string;

  @IsString()
  @MaxLength(10)
  expiresOn!: string;
}

class StaffDto {
  @IsString()
  @MaxLength(128)
  authUserId!: string;

  @IsIn(['counselor', 'manager'])
  role!: string;
}

class CandidateDto {
  @IsString()
  @MaxLength(200)
  email!: string;

  @IsBoolean()
  consent!: boolean;
}

class AssignmentDto {
  @IsUUID()
  staffId!: string;

  @IsUUID()
  candidateId!: string;
}

class OptInDto {
  @IsBoolean()
  discoverable!: boolean;
}

class ReadDto {
  @IsString()
  @MaxLength(200)
  token!: string;

  @IsUUID()
  workspaceId!: string;
}

class BrandDto {
  @IsString()
  @MaxLength(80)
  brandName!: string;

  @IsString()
  @MaxLength(200)
  attribution!: string;
}

class SalesInquiryDto {
  @IsString()
  @MaxLength(120)
  name!: string;

  @IsString()
  @MaxLength(200)
  email!: string;

  @IsString()
  @MaxLength(120)
  organization!: string;

  @IsString()
  @MaxLength(2000)
  message!: string;
}

export const remainingProviders: Provider[] = [
  {
    provide: RemainingService,
    inject: [DatabaseService, MeteringService],
    useFactory: (database: DatabaseService, metering: MeteringService) =>
      new RemainingService(
        database.connectionPool,
        metering,
        { now: () => new Date() },
        new UnconfiguredMapTiles(),
        createMailer(process.env),
      ),
  },
];

@Controller()
export class RemainingController {
  private readonly salesLimit = new WindowRateLimit(5, 60 * 60 * 1000);

  constructor(@Inject(RemainingService) private readonly remaining: RemainingService) {}

  @Public()
  @Post('sales-inquiries')
  submitSalesInquiry(@Req() request: Request, @Body() body: SalesInquiryDto) {
    const ip = request.ip || request.socket.remoteAddress || 'unknown';
    const gate = this.salesLimit.take(ip, new Date());
    if (!gate.allowed) throw new BillingError('rate_limited', { limit: gate.limit, retryAt: gate.retryAt });
    return this.remaining.submitSalesInquiry(body);
  }

  @Post('scenarios')
  createScenario(
    @CurrentPrincipal() principal: Principal,
    @Body() body: CreateScenarioDto,
    @IdempotencyKey() idempotencyKey: string | undefined,
  ) {
    return this.remaining.createScenario(principal, body.options, idempotencyKey);
  }

  @Get('learning-loop')
  learningLoop(@CurrentPrincipal() principal: Principal) {
    return this.remaining.learningLoop(principal);
  }

  @Post('forms')
  createForm(
    @CurrentPrincipal() principal: Principal,
    @Body() body: CreateFormDto,
    @IdempotencyKey() idempotencyKey: string | undefined,
  ) {
    return this.remaining.createForm(principal, body.site, idempotencyKey);
  }

  @Post('forms/:sessionId/review')
  reviewForm(@CurrentPrincipal() principal: Principal, @Param('sessionId') sessionId: string, @Body() body: ReviewFormDto) {
    return this.remaining.reviewForm(principal, sessionId, body.confirmed);
  }

  @Get('forms/:sessionId/fill')
  fillForm(@CurrentPrincipal() principal: Principal, @Param('sessionId') sessionId: string) {
    return this.remaining.fillForm(principal, sessionId);
  }

  @Get('maintenance')
  maintenance(@CurrentPrincipal() principal: Principal) {
    return this.remaining.maintenance(principal);
  }

  @Post('maintenance/achievements')
  addAchievement(@CurrentPrincipal() principal: Principal, @Body() body: TitleDto) {
    return this.remaining.addAchievement(principal, body.title);
  }

  @Post('maintenance/promotion-goals')
  addPromotionGoal(@CurrentPrincipal() principal: Principal, @Body() body: GoalDto) {
    return this.remaining.addPromotionGoal(principal, body.desiredTitle);
  }

  @Post('maintenance/credentials')
  addCredential(@CurrentPrincipal() principal: Principal, @Body() body: CredentialDto) {
    return this.remaining.addCredential(principal, body.name, body.expiresOn);
  }

  @Get('maps')
  mapList(@CurrentPrincipal() principal: Principal) {
    return this.remaining.mapList(principal);
  }

  @Post('maps')
  startMap(@CurrentPrincipal() principal: Principal, @IdempotencyKey() idempotencyKey: string | undefined) {
    return this.remaining.startMap(principal, idempotencyKey);
  }

  @Post('business/staff')
  addStaff(@CurrentPrincipal() principal: Principal, @Body() body: StaffDto) {
    return this.remaining.addStaff(principal, body.authUserId, body.role);
  }

  @Post('business/candidates')
  inviteCandidate(@CurrentPrincipal() principal: Principal, @Body() body: CandidateDto) {
    return this.remaining.inviteCandidate(principal, body.email, body.consent);
  }

  @Post('business/assignments')
  assignCounselor(@CurrentPrincipal() principal: Principal, @Body() body: AssignmentDto) {
    return this.remaining.assignCounselor(principal, body.staffId, body.candidateId);
  }

  @Get('business/candidates/:candidateId')
  getCandidate(@CurrentPrincipal() principal: Principal, @Param('candidateId') candidateId: string) {
    return this.remaining.getCandidate(principal, candidateId);
  }

  @Get('human-services')
  humanServices() {
    return this.remaining.humanServices();
  }

  @Post('human-services/:providerId/bookings')
  bookHumanService() {
    return this.remaining.bookHumanService();
  }

  @Post('recruiting/opt-in')
  setOptIn(@CurrentPrincipal() principal: Principal, @Body() body: OptInDto) {
    return this.remaining.setOptIn(principal, body.discoverable);
  }

  @Get('recruiting/search')
  recruitingSearch() {
    return this.remaining.recruitingSearch();
  }

  @Post('recruiting/checkout')
  employerCheckout() {
    return this.remaining.employerCheckout();
  }

  @Post('developer/keys')
  createApiKey(@CurrentPrincipal() principal: Principal) {
    return this.remaining.createApiKey(principal);
  }

  @Post('developer/reads')
  consumeRead(@CurrentPrincipal() principal: Principal, @Body() body: ReadDto) {
    return this.remaining.consumeRead(principal, body.token, body.workspaceId);
  }

  @Put('developer/white-label')
  setWhiteLabel(@CurrentPrincipal() principal: Principal, @Body() body: BrandDto) {
    return this.remaining.setWhiteLabel(principal, body.brandName, body.attribution);
  }
}
