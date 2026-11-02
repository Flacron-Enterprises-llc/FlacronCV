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
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  Max,
} from 'class-validator';
import {
  CareerModesService,
  type Principal,
} from '@flacroncv/career-server';
import {
  CreateLocationProfileInput,
  RemoteFlexibility,
  SpecialistMode,
  TargetTimeline,
  UpdateLocationProfileInput,
  UpdateSpecialistModeInput,
  WorkAuthorization,
} from '@flacroncv/career-shared';
import { CurrentPrincipal } from '../auth/auth.guard';
import { DatabaseService } from '../database/database.service';

const TIMELINES: TargetTimeline[] = [
  'immediate',
  '1_to_3_months',
  '3_to_6_months',
  'exploring',
  'not_relocating',
];

const WORK_AUTHS: WorkAuthorization[] = [
  'citizen',
  'permanent_resident',
  'visa_holder',
  'needs_sponsorship',
  'authorized',
];

const REMOTE_OPTS: RemoteFlexibility[] = ['remote_only', 'hybrid', 'onsite_only', 'any'];

const MODES: SpecialistMode[] = [
  'general',
  'technical_engineering',
  'executive_leadership',
  'creative_design',
  'academic_research',
  'career_transition',
];

class CreateLocationDto implements CreateLocationProfileInput {
  @IsString()
  @MaxLength(200)
  place!: string;

  @IsNumber()
  @Min(0)
  @Max(500)
  radiusMiles!: number;

  @IsOptional()
  @IsIn(TIMELINES)
  targetTimeline?: TargetTimeline;

  @IsOptional()
  @IsBoolean()
  isRelocation?: boolean;

  @IsOptional()
  @IsIn(WORK_AUTHS)
  workAuthorization?: WorkAuthorization;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(240)
  commuteMinutesMax?: number;

  @IsOptional()
  @IsIn(REMOTE_OPTS)
  remoteFlexibility?: RemoteFlexibility;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

class UpdateLocationDto implements UpdateLocationProfileInput {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  place?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(500)
  radiusMiles?: number;

  @IsOptional()
  @IsIn(TIMELINES)
  targetTimeline?: TargetTimeline;

  @IsOptional()
  @IsBoolean()
  isRelocation?: boolean;

  @IsOptional()
  @IsIn(WORK_AUTHS)
  workAuthorization?: WorkAuthorization;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(240)
  commuteMinutesMax?: number;

  @IsOptional()
  @IsIn(REMOTE_OPTS)
  remoteFlexibility?: RemoteFlexibility;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

class UpdateSpecialistModeDto implements UpdateSpecialistModeInput {
  @IsIn(MODES)
  mode!: SpecialistMode;

  @IsOptional()
  @IsArray()
  focusAreas?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  customGuidelines?: string;
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
      new CareerModesService(db.connectionPool),
    inject: [DatabaseService],
  },
];
