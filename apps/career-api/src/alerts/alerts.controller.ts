import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, Provider } from '@nestjs/common';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { AlertService, MeteringService, createAlertNotifier, createGeocoder, createRecordedEmailResolver } from '@flacroncv/career-server';
import type { Principal } from '@flacroncv/career-server';
import { LISTING_ARRANGEMENTS, LISTING_SCHEDULES, LISTING_SENIORITIES, OPPORTUNITY_FILTER_CATEGORIES, RELEVANCE_THRESHOLDS } from '@flacroncv/career-shared';
import { CurrentPrincipal } from '../auth/auth.guard';
import { DatabaseService } from '../database/database.service';

/** Filters shared by create and update. Personalized and relevance filters are checked against the plan by the service. */
class SearchFilterFields {
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100_000_000)
  minPay?: number | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== '')
  @Matches(/^[A-Za-z]{3}$/)
  payCurrency?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== '')
  @IsIn(['hour', 'day', 'week', 'month', 'year'])
  payPeriod?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== '')
  @IsIn([...LISTING_SCHEDULES])
  workSchedule?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== '')
  @IsIn([...LISTING_SENIORITIES])
  seniority?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== '')
  @IsIn([...LISTING_ARRANGEMENTS])
  arrangement?: string | null;

  @IsOptional()
  @IsIn([...RELEVANCE_THRESHOLDS])
  relevance?: string;
}

class SearchDto extends SearchFilterFields {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;

  @IsOptional()
  @IsIn([...OPPORTUNITY_FILTER_CATEGORIES])
  category?: string;

  @IsOptional()
  @IsUUID()
  locationProfileId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10000)
  radiusMiles?: number;

  @IsOptional()
  @IsIn(['weekly', 'daily', 'every_6_hours', 'hourly'])
  schedule?: string;
}

class SearchPatchDto extends SearchFilterFields {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;

  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== '')
  @IsIn([...OPPORTUNITY_FILTER_CATEGORIES])
  category?: string | null;

  @IsOptional()
  @IsBoolean()
  paused?: boolean;

  @IsOptional()
  @IsIn(['weekly', 'daily', 'every_6_hours', 'hourly'])
  schedule?: string;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  locationProfileId?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10000)
  radiusMiles?: number | null;
}

class LocationDto {
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
}

class CompanyListFields {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  aliases?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  roles?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  locations?: string[];
}

class CompanyDto extends CompanyListFields {
  @IsString()
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  sourceUrl?: string;
}

class CompanyPatchDto extends CompanyListFields {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;
}

class SettingsDto {
  @IsOptional()
  @IsBoolean()
  email?: boolean;

  @IsOptional()
  @IsBoolean()
  push?: boolean;

  @IsOptional()
  @IsBoolean()
  telegram?: boolean;

  @IsOptional()
  @IsIn(['weekly', 'daily', 'immediate'])
  digest?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5)
  quietStart?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(5)
  quietEnd?: string | null;

  @IsOptional()
  @IsBoolean()
  paused?: boolean;
}

class TrackerReminderDto {
  @IsIn(['application_follow_up', 'interview'])
  kind!: string;

  @IsString()
  @MaxLength(200)
  sourceKey!: string;

  @IsString()
  @MaxLength(300)
  title!: string;

  @Matches(/^\d{4}-\d{2}-\d{2}/)
  dueDate!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  link?: string | null;
}

class TrackerReminderSyncDto {
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => TrackerReminderDto)
  items!: TrackerReminderDto[];
}

export const alertProviders: Provider[] = [
  {
    provide: AlertService,
    inject: [DatabaseService, MeteringService],
    // Only channels with a configured provider are bound; the rest show "not connected" and keep items queued.
    useFactory: (database: DatabaseService, metering: MeteringService) =>
      new AlertService(
        database.connectionPool,
        metering,
        // Same address source as the worker: the verified email recorded from the person's own sign-in.
        createAlertNotifier(process.env, { resolveEmail: createRecordedEmailResolver(database.connectionPool) }),
        undefined,
        createGeocoder(process.env),
      ),
  },
];

@Controller()
export class AlertsController {
  constructor(@Inject(AlertService) private readonly alerts: AlertService) {}

  @Get('saved-searches')
  searches(@CurrentPrincipal() principal: Principal) {
    return this.alerts.searches(principal);
  }

  @Post('saved-searches')
  createSearch(@CurrentPrincipal() principal: Principal, @Body() body: SearchDto) {
    return this.alerts.createSearch(principal, body);
  }

  @Patch('saved-searches/:searchId')
  updateSearch(@CurrentPrincipal() principal: Principal, @Param('searchId') searchId: string, @Body() body: SearchPatchDto) {
    return this.alerts.updateSearch(principal, searchId, body);
  }

  @Delete('saved-searches/:searchId')
  deleteSearch(@CurrentPrincipal() principal: Principal, @Param('searchId') searchId: string) {
    return this.alerts.deleteSearch(principal, searchId);
  }

  @Get('location-profiles')
  locations(@CurrentPrincipal() principal: Principal) {
    return this.alerts.locations(principal);
  }

  @Post('location-profiles')
  createLocation(@CurrentPrincipal() principal: Principal, @Body() body: LocationDto) {
    return this.alerts.createLocation(principal, body);
  }

  @Patch('location-profiles/:profileId')
  updateLocation(@CurrentPrincipal() principal: Principal, @Param('profileId') profileId: string, @Body() body: LocationDto) {
    return this.alerts.updateLocation(principal, profileId, body);
  }

  @Delete('location-profiles/:profileId')
  deleteLocation(@CurrentPrincipal() principal: Principal, @Param('profileId') profileId: string) {
    return this.alerts.deleteLocation(principal, profileId);
  }

  @Get('followed-companies')
  companies(@CurrentPrincipal() principal: Principal) {
    return this.alerts.companies(principal);
  }

  @Post('followed-companies')
  follow(@CurrentPrincipal() principal: Principal, @Body() body: CompanyDto) {
    return this.alerts.follow(principal, body);
  }

  @Patch('followed-companies/:companyId')
  updateCompany(@CurrentPrincipal() principal: Principal, @Param('companyId') companyId: string, @Body() body: CompanyPatchDto) {
    return this.alerts.updateCompany(principal, companyId, body);
  }

  @Delete('followed-companies/:companyId')
  unfollow(@CurrentPrincipal() principal: Principal, @Param('companyId') companyId: string) {
    return this.alerts.unfollow(principal, companyId);
  }

  @Get('alerts')
  list(@CurrentPrincipal() principal: Principal) {
    return this.alerts.alerts(principal);
  }

  @Post('alerts/read-all')
  readAll(@CurrentPrincipal() principal: Principal) {
    return this.alerts.markAllRead(principal);
  }

  @Post('alerts/:alertId/read')
  read(@CurrentPrincipal() principal: Principal, @Param('alertId') alertId: string) {
    return this.alerts.markRead(principal, alertId);
  }

  @Patch('alert-settings')
  settings(@CurrentPrincipal() principal: Principal, @Body() body: SettingsDto) {
    return this.alerts.updateSettings(principal, body);
  }

  @Get('reminders')
  reminders(@CurrentPrincipal() principal: Principal) {
    return this.alerts.reminders(principal);
  }

  @Post('reminders/tracker-sync')
  syncTracker(@CurrentPrincipal() principal: Principal, @Body() body: TrackerReminderSyncDto) {
    return this.alerts.syncTrackerReminders(principal, body);
  }

  @Post('reminders/:reminderId/read')
  readReminder(@CurrentPrincipal() principal: Principal, @Param('reminderId') reminderId: string) {
    return this.alerts.markReminderRead(principal, reminderId);
  }
}
