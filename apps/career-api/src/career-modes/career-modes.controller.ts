import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Provider,
} from '@nestjs/common';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, ValidateIf } from 'class-validator';
import {
  CareerModesService,
  createGeocoder,
  type Principal,
} from '@flacroncv/career-server';
import {
  LICENSE_TRANSFERS,
  LOCATION_KINDS,
  MAX_ACTIVE_MODES,
  REMOTE_FLEXIBILITIES,
  SPECIALIST_MODE_IDS,
  TARGET_TIMELINES,
  WORK_AUTHORIZATIONS,
} from '@flacroncv/career-shared';
import type {
  CreateLocationProfileInput,
  LicenseTransfer,
  LocationKind,
  RemoteFlexibility,
  SpecialistMode,
  TargetTimeline,
  UpdateLocationProfileInput,
  UpdateSpecialistModeInput,
  WorkAuthorization,
} from '@flacroncv/career-shared';
import { CurrentPrincipal } from '../auth/auth.guard';
import { DatabaseService } from '../database/database.service';

const TIMELINES = [...TARGET_TIMELINES];
const WORK_AUTHS = [...WORK_AUTHORIZATIONS];
const REMOTE_OPTS = [...REMOTE_FLEXIBILITIES];
const KINDS = [...LOCATION_KINDS];
const LICENSES = [...LICENSE_TRANSFERS];
const MODES = [...SPECIALIST_MODE_IDS];
const DATE = /^\d{4}-\d{2}-\d{2}$/;

class LocationFieldsDto {
  @IsOptional()
  @IsIn(KINDS)
  kind?: LocationKind;

  @IsOptional()
  @IsIn(TIMELINES)
  targetTimeline?: TargetTimeline;

  @IsOptional()
  @IsBoolean()
  isRelocation?: boolean;

  /** Calendar validity (no 2026-02-31) is checked in the service. */
  @IsOptional()
  @ValidateIf((_o, value) => value !== null)
  @Matches(DATE)
  moveDate?: string | null;

  @IsOptional()
  @ValidateIf((_o, value) => value !== null)
  @Matches(DATE)
  availableFrom?: string | null;

  @IsOptional()
  @ValidateIf((_o, value) => value !== null)
  @IsString()
  @MaxLength(120)
  remoteRegion?: string | null;

  @IsOptional()
  @IsIn(WORK_AUTHS)
  workAuthorization?: WorkAuthorization;

  @IsOptional()
  @IsIn(LICENSES)
  licenseTransfer?: LicenseTransfer;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(240)
  commuteMinutesMax?: number;

  @IsOptional()
  @IsIn(REMOTE_OPTS)
  remoteFlexibility?: RemoteFlexibility;

  @IsOptional()
  @ValidateIf((_o, value) => value !== null)
  @IsString()
  @MaxLength(2000)
  notes?: string | null;
}

class CreateLocationDto extends LocationFieldsDto implements CreateLocationProfileInput {
  @IsString()
  @MaxLength(200)
  place!: string;

  @IsInt()
  @Min(0)
  @Max(500)
  radiusMiles!: number;
}

class UpdateLocationDto extends LocationFieldsDto implements UpdateLocationProfileInput {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  place?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(500)
  radiusMiles?: number;
}

class UpdateSpecialistModeDto implements UpdateSpecialistModeInput {
  @IsOptional()
  @ValidateIf((_o, value) => value !== null)
  @IsIn(MODES)
  mode?: SpecialistMode | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_ACTIVE_MODES)
  @IsIn(MODES, { each: true })
  modes?: SpecialistMode[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @IsString({ each: true })
  focusAreas?: string[];

  @IsOptional()
  @ValidateIf((_o, value) => value !== null)
  @IsString()
  @MaxLength(2000)
  customGuidelines?: string | null;
}

@Controller('career-modes')
export class CareerModesController {
  constructor(private readonly careerModesService: CareerModesService) {}

  @Get('locations')
  async listLocations(@CurrentPrincipal() principal: Principal) {
    return this.careerModesService.listLocations(principal);
  }

  @Post('locations')
  async createLocation(
    @CurrentPrincipal() principal: Principal,
    @Body() body: CreateLocationDto,
  ) {
    return this.careerModesService.createLocation(principal, body);
  }

  @Get('locations/:id')
  async getLocation(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
  ) {
    return this.careerModesService.getLocation(principal, id);
  }

  @Patch('locations/:id')
  async updateLocation(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Body() body: UpdateLocationDto,
  ) {
    return this.careerModesService.updateLocation(principal, id, body);
  }

  @Delete('locations/:id')
  async deleteLocation(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
  ) {
    await this.careerModesService.deleteLocation(principal, id);
    return { success: true };
  }

  /**
   * The mode context generators and searches read (wording, constraints,
   * suggested filters, checklist, current and future places). Free; grants nothing.
   */
  @Get('context')
  async modeContext(@CurrentPrincipal() principal: Principal) {
    return this.careerModesService.modeContext(principal);
  }

  @Get('specialist-mode')
  async getSpecialistMode(@CurrentPrincipal() principal: Principal) {
    return this.careerModesService.getSpecialistMode(principal);
  }

  @Put('specialist-mode')
  async setSpecialistMode(
    @CurrentPrincipal() principal: Principal,
    @Body() body: UpdateSpecialistModeDto,
  ) {
    return this.careerModesService.setSpecialistMode(principal, body);
  }
}

export const careerModesProviders: Provider[] = [
  {
    provide: CareerModesService,
    useFactory: (db: DatabaseService) =>
      // Same geocoder as Alerts: places saved here get coordinates when a provider is configured.
      new CareerModesService(db.connectionPool, undefined, createGeocoder(process.env)),
    inject: [DatabaseService],
  },
];
