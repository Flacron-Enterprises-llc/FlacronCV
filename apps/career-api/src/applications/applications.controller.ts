import { Body, Controller, Get, Inject, Param, Patch, Post, Provider } from '@nestjs/common';
import { IsArray, IsBoolean, IsIn, IsOptional, IsString, IsUUID, MaxLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { APPLICATION_STATUSES } from '@flacroncv/career-shared';
import { ApplicationService } from '@flacroncv/career-server';
import type { Principal } from '@flacroncv/career-server';
import { CurrentPrincipal } from '../auth/auth.guard';
import { DatabaseService } from '../database/database.service';

class CreateDto {
  @IsUUID()
  opportunityId!: string;

  @IsUUID()
  resumeVersionId!: string;
}

class ContactDto {
  @IsString()
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  email?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string | null;
}

class ChecklistDto {
  @IsString()
  @MaxLength(200)
  label!: string;

  @IsBoolean()
  done!: boolean;
}

class DatesDto {
  @IsOptional()
  @IsString()
  @MaxLength(10)
  deadline?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  applied?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  interview?: string | null;
}

class UpdateDto {
  @IsOptional()
  @IsIn([...APPLICATION_STATUSES])
  status?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  notes?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ContactDto)
  contacts?: ContactDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => DatesDto)
  dates?: DatesDto;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChecklistDto)
  checklist?: ChecklistDto[];

  @IsOptional()
  @IsUUID()
  resumeVersionId?: string;

  @IsOptional()
  @IsUUID()
  letterId?: string;
}

class ReminderDto {
  @IsString()
  @MaxLength(40)
  remindAt!: string;
}

export const applicationProviders: Provider[] = [
  {
    provide: ApplicationService,
    inject: [DatabaseService],
    useFactory: (database: DatabaseService) => new ApplicationService(database.connectionPool),
  },
];

@Controller()
export class ApplicationsController {
  constructor(@Inject(ApplicationService) private readonly applications: ApplicationService) {}

  @Get('applications')
  list(@CurrentPrincipal() principal: Principal) {
    return this.applications.list(principal);
  }

  @Post('applications')
  create(@CurrentPrincipal() principal: Principal, @Body() body: CreateDto) {
    return this.applications.create(principal, body);
  }

  @Get('applications/:applicationId/calendar')
  calendar(@CurrentPrincipal() principal: Principal, @Param('applicationId') applicationId: string) {
    return this.applications.calendar(principal, applicationId);
  }

  @Get('applications/:applicationId')
  get(@CurrentPrincipal() principal: Principal, @Param('applicationId') applicationId: string) {
    return this.applications.get(principal, applicationId);
  }

  @Patch('applications/:applicationId')
  update(
    @CurrentPrincipal() principal: Principal,
    @Param('applicationId') applicationId: string,
    @Body() body: UpdateDto,
  ) {
    return this.applications.update(principal, applicationId, body);
  }

  @Post('applications/:applicationId/reminders')
  remind(
    @CurrentPrincipal() principal: Principal,
    @Param('applicationId') applicationId: string,
    @Body() body: ReminderDto,
  ) {
    return this.applications.remind(principal, applicationId, body);
  }
}
