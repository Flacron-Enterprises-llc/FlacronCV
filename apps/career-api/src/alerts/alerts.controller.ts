import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, Provider } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
import { AlertService, RecordingAlertNotifier, MeteringService } from '@flacroncv/career-server';
import type { Principal } from '@flacroncv/career-server';
import { CurrentPrincipal } from '../auth/auth.guard';
import { DatabaseService } from '../database/database.service';

class SearchDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
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

class SearchPatchDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;

  @IsOptional()
  @IsBoolean()
  paused?: boolean;

  @IsOptional()
  @IsIn(['weekly', 'daily', 'every_6_hours', 'hourly'])
  schedule?: string;
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

class CompanyDto {
  @IsString()
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  sourceUrl?: string;
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

export const alertProviders: Provider[] = [
  {
    provide: AlertService,
    inject: [DatabaseService, MeteringService],
    useFactory: (database: DatabaseService, metering: MeteringService) =>
      new AlertService(database.connectionPool, metering, new RecordingAlertNotifier()),
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

  @Delete('followed-companies/:companyId')
  unfollow(@CurrentPrincipal() principal: Principal, @Param('companyId') companyId: string) {
    return this.alerts.unfollow(principal, companyId);
  }

  @Get('alerts')
  list(@CurrentPrincipal() principal: Principal) {
    return this.alerts.alerts(principal);
  }

  @Patch('alert-settings')
  settings(@CurrentPrincipal() principal: Principal, @Body() body: SettingsDto) {
    return this.alerts.updateSettings(principal, body);
  }
}
