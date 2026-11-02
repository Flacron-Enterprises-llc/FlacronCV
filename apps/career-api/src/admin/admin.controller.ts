import { Body, Controller, Get, Inject, Param, Patch, Post, Query, Provider } from '@nestjs/common';
import { IsBoolean, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { AdminService, adminUidSet, OpportunityTrustService } from '@flacroncv/career-server';
import type { Principal } from '@flacroncv/career-server';
import type { ModerationAction, ModerationStatus } from '@flacroncv/career-shared';
import { CurrentPrincipal, OperatorRoute } from '../auth/auth.guard';
import { DatabaseService } from '../database/database.service';

class PublishDto {}

class FlagDto {
  @IsString()
  @MaxLength(64)
  feature!: string;

  @IsBoolean()
  enabled!: boolean;
}

class ModerationQueueQuery {
  @IsOptional()
  @IsString()
  @IsIn(['unflagged', 'flagged', 'under_review', 'verified', 'suppressed'])
  status?: ModerationStatus;
}

class ModerateOpportunityDto {
  @IsString()
  @IsIn(['verify', 'suppress', 'dismiss'])
  action!: ModerationAction;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export const ADMIN_UIDS = Symbol('ADMIN_UIDS');

export const adminProviders: Provider[] = [
  {
    provide: ADMIN_UIDS,
    useFactory: (): ReadonlySet<string> => adminUidSet(process.env.ADMIN_AUTH_USER_IDS),
  },
  {
    provide: AdminService,
    inject: [DatabaseService, ADMIN_UIDS],
    useFactory: (database: DatabaseService, admins: ReadonlySet<string>) => new AdminService(database.connectionPool, admins),
  },
  {
    provide: OpportunityTrustService,
    inject: [DatabaseService, ADMIN_UIDS],
    useFactory: (database: DatabaseService, admins: ReadonlySet<string>) =>
      new OpportunityTrustService(database.connectionPool, undefined, admins),
  },
];

// V1 integration: V1 staff claim + allowlist; independent of the operator's own career plan.
@OperatorRoute()
@Controller()
export class AdminController {
  constructor(
    @Inject(AdminService) private readonly admin: AdminService,
    @Inject(OpportunityTrustService) private readonly trustService: OpportunityTrustService,
  ) {}

  @Get('admin/catalog')
  catalog(@CurrentPrincipal() principal: Principal) {
    return this.admin.catalog(principal);
  }

  @Post('admin/catalog')
  publish(@CurrentPrincipal() principal: Principal, @Body() _body: PublishDto) {
    return this.admin.publish(principal);
  }

  @Get('admin/flags')
  flags(@CurrentPrincipal() principal: Principal) {
    return this.admin.flags(principal);
  }

  @Patch('admin/flags')
  setFlag(@CurrentPrincipal() principal: Principal, @Body() body: FlagDto) {
    return this.admin.setFlag(principal, body.feature, body.enabled);
  }

  @Get('admin/health')
  health(@CurrentPrincipal() principal: Principal) {
    return this.admin.health(principal);
  }

  @Get('admin/audit')
  audit(@CurrentPrincipal() principal: Principal) {
    return this.admin.audit(principal);
  }

  @Get('admin/moderation/opportunities')
  moderationQueue(@CurrentPrincipal() principal: Principal, @Query() query: ModerationQueueQuery) {
    return this.trustService.listModerationQueue(principal, query);
  }

  @Post('admin/moderation/opportunities/:opportunityId/action')
  moderateOpportunity(
    @CurrentPrincipal() principal: Principal,
    @Param('opportunityId') opportunityId: string,
    @Body() body: ModerateOpportunityDto,
  ) {
    return this.trustService.moderateListing(principal, opportunityId, body);
  }
}
