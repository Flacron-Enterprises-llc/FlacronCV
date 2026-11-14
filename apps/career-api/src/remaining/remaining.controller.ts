import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, Provider, Put, Query, Req } from '@nestjs/common';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import type { Request } from 'express';
import {
  BillingError,
  BusinessService,
  CareerProfileService,
  MeteringService,
  RemainingService,
  UnconfiguredMapTiles,
  WindowRateLimit,
  createMailer,
} from '@flacroncv/career-server';
import type { FactWriter, Principal } from '@flacroncv/career-server';
import { BUSINESS_STAFF_ROLES, MAX_SCENARIO_OPTIONS, SCENARIO_SOURCES, SCENARIO_UNCERTAINTIES } from '@flacroncv/career-shared';
import type { ApiKeyEnvironment, ScenarioSource, ScenarioUncertainty } from '@flacroncv/career-shared';
import { BusinessInviteRoute, CurrentPrincipal, Public } from '../auth/auth.guard';
import { DatabaseService } from '../database/database.service';
import { IdempotencyKey } from '../metering/metering.providers';
import type { V1AccountSource } from '@flacroncv/career-server';
import { V1_ACCOUNT_SOURCE } from '../integration/career-access.service';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

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

  @IsIn([...SCENARIO_SOURCES])
  source!: ScenarioSource;

  @IsOptional()
  @ValidateIf((_object, value) => value !== null)
  @IsString()
  @MaxLength(120)
  sourceName?: string | null;

  @IsOptional()
  @ValidateIf((_object, value) => value !== null)
  @Matches(DATE)
  sourceDate?: string | null;

  @IsOptional()
  @IsIn([...SCENARIO_UNCERTAINTIES])
  uncertainty?: ScenarioUncertainty;

  @IsOptional()
  @ValidateIf((_object, value) => value !== null)
  @IsString()
  @MaxLength(500)
  requirements?: string | null;

  @IsOptional()
  @ValidateIf((_object, value) => value !== null)
  @IsUUID()
  locationProfileId?: string | null;

  @IsOptional()
  @ValidateIf((_object, value) => value !== null)
  @IsUUID()
  skillReportId?: string | null;
}

class ScenarioLinksDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsUUID('all', { each: true })
  locationProfileIds?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsUUID('all', { each: true })
  skillReportIds?: string[];
}

class CreateScenarioDto extends ScenarioLinksDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_SCENARIO_OPTIONS)
  @ValidateNested({ each: true })
  @Type(() => ScenarioOptionDto)
  options!: ScenarioOptionDto[];
}

class UpdateScenarioDto extends ScenarioLinksDto {
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_SCENARIO_OPTIONS)
  @ValidateNested({ each: true })
  @Type(() => ScenarioOptionDto)
  options?: ScenarioOptionDto[];
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

class AchievementDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  details?: string;

  @IsOptional()
  @ValidateIf((_o, value) => value !== null)
  @Matches(DATE)
  achievedOn?: string | null;

  @IsOptional()
  @ValidateIf((_o, value) => value !== null)
  @IsUUID()
  factId?: string | null;

  @IsOptional()
  @ValidateIf((_o, value) => value !== null)
  @IsUUID()
  evidenceId?: string | null;
}

class GoalDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  desiredTitle?: string;

  @IsOptional()
  @ValidateIf((_o, value) => value !== null)
  @Matches(DATE)
  targetDate?: string | null;

  @IsOptional()
  @IsIn(['open', 'dropped'])
  status?: 'open' | 'dropped';
}

class ConfirmPromotionDto {
  @IsBoolean()
  confirmed!: boolean;

  @IsOptional()
  @ValidateIf((_o, value) => value !== null)
  @IsUUID()
  experienceFactId?: string | null;

  @IsOptional()
  @ValidateIf((_o, value) => value !== null)
  @IsString()
  @MaxLength(200)
  company?: string | null;

  @IsOptional()
  @ValidateIf((_o, value) => value !== null)
  @Matches(DATE)
  startDate?: string | null;
}

class CredentialDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  /** Shape here; real calendar dates (no 2026-02-31) are checked in the service. */
  @IsOptional()
  @IsString()
  @MaxLength(10)
  expiresOn?: string;

  @IsOptional()
  @ValidateIf((_o, value) => value !== null)
  @Matches(DATE)
  reviewOn?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  issuer?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  region?: string;

  @IsOptional()
  @ValidateIf((_o, value) => value !== null)
  @IsUUID()
  factId?: string | null;

  @IsOptional()
  @ValidateIf((_o, value) => value !== null)
  @IsUUID()
  evidenceId?: string | null;
}

class WorkspaceQuery {
  @IsOptional()
  @IsUUID()
  workspace?: string;
}

class StaffInviteDto {
  @IsString()
  @MaxLength(200)
  email!: string;

  @IsIn([...BUSINESS_STAFF_ROLES])
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

  @IsOptional()
  @IsBoolean()
  assigned?: boolean;
}

class ArchiveDto {
  @IsBoolean()
  archived!: boolean;
}

class AcceptDto {
  @IsString()
  @MaxLength(200)
  token!: string;
}

class ShareDto {
  @IsBoolean()
  shareProfile!: boolean;
}

class QueueItemDto {
  @IsString()
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @ValidateIf((_o, value) => value !== null)
  @IsString()
  @MaxLength(500)
  url?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;

  @IsOptional()
  @ValidateIf((_o, value) => value !== null)
  @IsUUID()
  candidateId?: string | null;
}

class OptInDto {
  @IsBoolean()
  discoverable!: boolean;
}

class KeyDto {
  @IsOptional()
  @IsIn(['test', 'live'])
  environment?: ApiKeyEnvironment;
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

/** The first configured website origin, for absolute links in invitation emails. */
function inviteOrigin(env: NodeJS.ProcessEnv = process.env): string | null {
  const first = env.CORS_ORIGINS?.split(',').map((origin) => origin.trim()).find((origin) => origin.length > 0);
  if (!first) return null;
  try {
    const url = new URL(first);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.origin : null;
  } catch {
    return null;
  }
}

export const remainingProviders: Provider[] = [
  {
    provide: RemainingService,
    inject: [DatabaseService, MeteringService, V1_ACCOUNT_SOURCE, CareerProfileService],
    useFactory: (database: DatabaseService, metering: MeteringService, v1: V1AccountSource, profile: CareerProfileService) =>
      new RemainingService(
        database.connectionPool,
        metering,
        { now: () => new Date() },
        new UnconfiguredMapTiles(),
        createMailer(process.env),
        // V1 integration: outcome analytics read V1's Jobs tracker (read-only).
        (owner) => v1.jobStatuses(owner.authUserId),
        // Confirming a promotion writes the profile through the normal fact rules and history.
        profile as unknown as FactWriter,
      ),
  },
  {
    provide: BusinessService,
    inject: [DatabaseService],
    useFactory: (database: DatabaseService) =>
      new BusinessService(database.connectionPool, { now: () => new Date() }, createMailer(process.env), inviteOrigin()),
  },
];

@Controller()
export class RemainingController {
  private readonly salesLimit = new WindowRateLimit(5, 60 * 60 * 1000);
  private readonly acceptLimit = new WindowRateLimit(20, 60 * 60 * 1000);

  constructor(
    @Inject(RemainingService) private readonly remaining: RemainingService,
    @Inject(BusinessService) private readonly business: BusinessService,
  ) {}

  @Public()
  @Post('sales-inquiries')
  submitSalesInquiry(@Req() request: Request, @Body() body: SalesInquiryDto) {
    const ip = request.ip || request.socket.remoteAddress || 'unknown';
    const gate = this.salesLimit.take(ip, new Date());
    if (!gate.allowed) throw new BillingError('rate_limited', { limit: gate.limit, retryAt: gate.retryAt });
    return this.remaining.submitSalesInquiry(body);
  }

  // Scenarios ---------------------------------------------------------------

  @Get('scenarios')
  listScenarios(@CurrentPrincipal() principal: Principal) {
    return this.remaining.listScenarios(principal);
  }

  @Post('scenarios')
  createScenario(
    @CurrentPrincipal() principal: Principal,
    @Body() body: CreateScenarioDto,
    @IdempotencyKey() idempotencyKey: string | undefined,
  ) {
    return this.remaining.createScenario(principal, body.options, idempotencyKey, {
      title: body.title,
      locationProfileIds: body.locationProfileIds,
      skillReportIds: body.skillReportIds,
    });
  }

  @Get('scenarios/:scenarioId')
  getScenario(@CurrentPrincipal() principal: Principal, @Param('scenarioId') scenarioId: string) {
    return this.remaining.getScenario(principal, scenarioId);
  }

  @Patch('scenarios/:scenarioId')
  updateScenario(@CurrentPrincipal() principal: Principal, @Param('scenarioId') scenarioId: string, @Body() body: UpdateScenarioDto) {
    return this.remaining.updateScenario(principal, scenarioId, body);
  }

  @Delete('scenarios/:scenarioId')
  deleteScenario(@CurrentPrincipal() principal: Principal, @Param('scenarioId') scenarioId: string) {
    return this.remaining.deleteScenario(principal, scenarioId);
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

  // Maintenance ---------------------------------------------------------------

  @Get('maintenance')
  maintenance(@CurrentPrincipal() principal: Principal) {
    return this.remaining.maintenance(principal);
  }

  @Get('maintenance/reminders')
  credentialReminders(@CurrentPrincipal() principal: Principal) {
    return this.remaining.credentialReminders(principal).then((items) => ({ items }));
  }

  @Post('maintenance/achievements')
  addAchievement(@CurrentPrincipal() principal: Principal, @Body() body: AchievementDto) {
    return this.remaining.addAchievement(principal, { ...body, title: body.title ?? '' });
  }

  @Patch('maintenance/achievements/:id')
  updateAchievement(@CurrentPrincipal() principal: Principal, @Param('id') id: string, @Body() body: AchievementDto) {
    return this.remaining.updateAchievement(principal, id, body);
  }

  @Delete('maintenance/achievements/:id')
  deleteAchievement(@CurrentPrincipal() principal: Principal, @Param('id') id: string) {
    return this.remaining.deleteAchievement(principal, id);
  }

  @Post('maintenance/promotion-goals')
  addPromotionGoal(@CurrentPrincipal() principal: Principal, @Body() body: GoalDto) {
    return this.remaining.addPromotionGoal(principal, { desiredTitle: body.desiredTitle ?? '', targetDate: body.targetDate });
  }

  @Patch('maintenance/promotion-goals/:id')
  updatePromotionGoal(@CurrentPrincipal() principal: Principal, @Param('id') id: string, @Body() body: GoalDto) {
    return this.remaining.updatePromotionGoal(principal, id, body);
  }

  @Delete('maintenance/promotion-goals/:id')
  deletePromotionGoal(@CurrentPrincipal() principal: Principal, @Param('id') id: string) {
    return this.remaining.deletePromotionGoal(principal, id);
  }

  @Post('maintenance/promotion-goals/:id/confirm')
  confirmPromotion(@CurrentPrincipal() principal: Principal, @Param('id') id: string, @Body() body: ConfirmPromotionDto) {
    return this.remaining.confirmPromotion(principal, id, body);
  }

  @Post('maintenance/credentials')
  addCredential(@CurrentPrincipal() principal: Principal, @Body() body: CredentialDto) {
    return this.remaining.addCredential(principal, { ...body, name: body.name ?? '', expiresOn: body.expiresOn ?? '' });
  }

  @Patch('maintenance/credentials/:id')
  updateCredential(@CurrentPrincipal() principal: Principal, @Param('id') id: string, @Body() body: CredentialDto) {
    return this.remaining.updateCredential(principal, id, body);
  }

  @Delete('maintenance/credentials/:id')
  deleteCredential(@CurrentPrincipal() principal: Principal, @Param('id') id: string) {
    return this.remaining.deleteCredential(principal, id);
  }

  // Map ---------------------------------------------------------------------

  @Get('maps')
  mapList(@CurrentPrincipal() principal: Principal) {
    return this.remaining.mapList(principal);
  }

  @Post('maps')
  startMap(@CurrentPrincipal() principal: Principal, @IdempotencyKey() idempotencyKey: string | undefined) {
    return this.remaining.startMap(principal, idempotencyKey);
  }

  // Business workspace (`?workspace=` acts in a workspace where the caller is staff) ----

  @Get('business/memberships')
  businessMemberships(@CurrentPrincipal() principal: Principal) {
    return this.business.memberships(principal);
  }

  @Get('business')
  businessOverview(@CurrentPrincipal() principal: Principal, @Query() query: WorkspaceQuery) {
    return this.business.overview(principal, query.workspace);
  }

  @Post('business/staff')
  inviteStaff(@CurrentPrincipal() principal: Principal, @Query() query: WorkspaceQuery, @Body() body: StaffInviteDto) {
    return this.business.inviteStaff(principal, query.workspace, body.email, body.role);
  }

  @Delete('business/staff/:staffId')
  removeStaff(@CurrentPrincipal() principal: Principal, @Query() query: WorkspaceQuery, @Param('staffId') staffId: string) {
    return this.business.removeStaff(principal, query.workspace, staffId);
  }

  @Post('business/candidates')
  inviteCandidate(@CurrentPrincipal() principal: Principal, @Query() query: WorkspaceQuery, @Body() body: CandidateDto) {
    return this.business.inviteCandidate(principal, query.workspace, body.email, body.consent);
  }

  @Get('business/candidates/:candidateId')
  getCandidate(@CurrentPrincipal() principal: Principal, @Query() query: WorkspaceQuery, @Param('candidateId') candidateId: string) {
    return this.business.candidate(principal, query.workspace, candidateId);
  }

  @Delete('business/candidates/:candidateId/invitation')
  revokeCandidateInvite(@CurrentPrincipal() principal: Principal, @Query() query: WorkspaceQuery, @Param('candidateId') candidateId: string) {
    return this.business.revokeCandidateInvite(principal, query.workspace, candidateId);
  }

  @Put('business/candidates/:candidateId/archived')
  archiveCandidate(
    @CurrentPrincipal() principal: Principal,
    @Query() query: WorkspaceQuery,
    @Param('candidateId') candidateId: string,
    @Body() body: ArchiveDto,
  ) {
    return this.business.setCandidateArchived(principal, query.workspace, candidateId, body.archived);
  }

  @Post('business/assignments')
  assignCounselor(@CurrentPrincipal() principal: Principal, @Query() query: WorkspaceQuery, @Body() body: AssignmentDto) {
    return this.business.assignCounselor(principal, query.workspace, body.staffId, body.candidateId, body.assigned ?? true);
  }

  @BusinessInviteRoute()
  @Post('business/invitations/accept')
  acceptInvitation(@CurrentPrincipal() principal: Principal, @Body() body: AcceptDto) {
    const gate = this.acceptLimit.take(principal.authUserId, new Date());
    if (!gate.allowed) throw new BillingError('rate_limited', { limit: gate.limit, retryAt: gate.retryAt });
    return this.business.acceptInvitation(principal, body.token);
  }

  @Put('business/my/:candidateId/share')
  setShareProfile(@CurrentPrincipal() principal: Principal, @Param('candidateId') candidateId: string, @Body() body: ShareDto) {
    return this.business.setShareProfile(principal, candidateId, body.shareProfile);
  }

  @Delete('business/my/:candidateId')
  leaveWorkspace(@CurrentPrincipal() principal: Principal, @Param('candidateId') candidateId: string) {
    return this.business.leave(principal, candidateId);
  }

  @Get('business/queue')
  businessQueue(@CurrentPrincipal() principal: Principal, @Query() query: WorkspaceQuery) {
    return this.business.queue(principal, query.workspace);
  }

  @Post('business/queue')
  addQueueItem(@CurrentPrincipal() principal: Principal, @Query() query: WorkspaceQuery, @Body() body: QueueItemDto) {
    return this.business.addQueueItem(principal, query.workspace, body);
  }

  @Delete('business/queue/:itemId')
  removeQueueItem(@CurrentPrincipal() principal: Principal, @Query() query: WorkspaceQuery, @Param('itemId') itemId: string) {
    return this.business.removeQueueItem(principal, query.workspace, itemId);
  }

  @Get('business/usage')
  businessUsage(@CurrentPrincipal() principal: Principal, @Query() query: WorkspaceQuery) {
    return this.business.usage(principal, query.workspace);
  }

  @Get('business/report')
  businessReport(@CurrentPrincipal() principal: Principal, @Query() query: WorkspaceQuery) {
    return this.business.report(principal, query.workspace);
  }

  // Human services, recruiting, developer -------------------------------------

  @Get('human-services')
  humanServices() {
    return this.remaining.humanServices();
  }

  @Post('human-services/:providerId/bookings')
  bookHumanService() {
    return this.remaining.bookHumanService();
  }

  @Get('recruiting/opt-in')
  getOptIn(@CurrentPrincipal() principal: Principal) {
    return this.remaining.getOptIn(principal);
  }

  @Post('recruiting/opt-in')
  setOptIn(@CurrentPrincipal() principal: Principal, @Body() body: OptInDto) {
    return this.remaining.setOptIn(principal, body.discoverable);
  }

  /** A count only. Identities are an operator tool (`GET /admin/recruiting/opt-ins`). */
  @Get('recruiting/search')
  recruitingSearch() {
    return this.remaining.recruitingCount();
  }

  @Post('recruiting/checkout')
  employerCheckout() {
    return this.remaining.employerCheckout();
  }

  @Get('developer')
  developerStatus(@CurrentPrincipal() principal: Principal) {
    return this.remaining.developerStatus(principal);
  }

  @Post('developer/keys')
  createApiKey(@CurrentPrincipal() principal: Principal, @Body() body: KeyDto) {
    return this.remaining.createApiKey(principal, body.environment ?? 'live');
  }

  @Delete('developer/keys/:keyId')
  revokeApiKey(@CurrentPrincipal() principal: Principal, @Param('keyId') keyId: string) {
    return this.remaining.revokeApiKey(principal, keyId);
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
