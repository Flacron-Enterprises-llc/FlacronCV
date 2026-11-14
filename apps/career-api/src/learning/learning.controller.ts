import {
  Body,
  Controller,
  Get,
  Inject,
  Optional,
  Param,
  Patch,
  Post,
  Provider,
  Put,
} from '@nestjs/common';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  SkillsLearningService,
  MeteringService,
  type Principal,
  type TextModel,
} from '@flacroncv/career-server';
import { TEXT_MODEL } from '../ai/ai.providers';
import { CurrentPrincipal } from '../auth/auth.guard';
import { DatabaseService } from '../database/database.service';
import { IdempotencyKey } from '../metering/metering.providers';

class CreateSkillReportDto {
  @IsString()
  @IsNotEmpty()
  targetRole!: string;

  @IsString()
  @IsOptional()
  targetIndustry?: string;

  @IsInt()
  @Min(1)
  @IsOptional()
  timeBudgetHoursPerWeek?: number;

  @IsInt()
  @Min(0)
  @IsOptional()
  financialBudgetCents?: number;

  @IsBoolean()
  @IsOptional()
  includeProjectBrief?: boolean;
}

class UpdateProgressDto {
  @IsBoolean()
  completed!: boolean;
}

/** The person's own words; the service trims and bounds it. */
class OwnershipDto {
  @IsString()
  @IsOptional()
  @MaxLength(4000)
  ownershipStatement?: string;
}

class RubricCriterionCheckDto {
  @IsString()
  criterionId!: string;

  @IsBoolean()
  met!: boolean;

  @IsString()
  @MaxLength(2000)
  note!: string;
}

class RubricCheckDto {
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  evidenceIds!: string[];

  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => RubricCriterionCheckDto)
  criteria!: RubricCriterionCheckDto[];
}

@Controller('learning/skill-reports')
export class LearningController {
  constructor(
    @Inject(SkillsLearningService)
    private readonly learningService: SkillsLearningService,
  ) {}

  @Get()
  async list(@CurrentPrincipal() principal: Principal) {
    return this.learningService.list(principal);
  }

  @Get(':id')
  async get(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
  ) {
    return this.learningService.get(principal, id);
  }

  @Post()
  async create(
    @CurrentPrincipal() principal: Principal,
    @Body() body: CreateSkillReportDto,
    @IdempotencyKey() idempotencyKey: string | undefined,
  ) {
    const out = await this.learningService.create(principal, body, idempotencyKey);
    return {
      report: out.result.report,
      usage: { ...out.usage, renewalDate: out.usage.renewalDate.toISOString() },
      jobId: out.jobId,
      replayed: out.replayed,
    };
  }

  @Patch(':id/milestones/:milestoneId')
  async updateProgress(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Param('milestoneId') milestoneId: string,
    @Body() body: UpdateProgressDto,
  ) {
    return this.learningService.updateProgress(principal, id, milestoneId, body.completed);
  }

  @Post(':id/milestones/:milestoneId/evidence')
  async convertToEvidence(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Param('milestoneId') milestoneId: string,
    @Body() body: OwnershipDto,
  ) {
    return this.learningService.convertToEvidence(principal, id, milestoneId, { ownershipStatement: body?.ownershipStatement });
  }

  @Put(':id/project-brief/ownership')
  async setOwnership(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Body() body: OwnershipDto,
  ) {
    return this.learningService.setOwnershipStatement(principal, id, body?.ownershipStatement ?? '');
  }

  @Post(':id/project-brief/evidence')
  async addProjectToEvidence(@CurrentPrincipal() principal: Principal, @Param('id') id: string) {
    return this.learningService.addProjectToEvidence(principal, id);
  }

  @Put(':id/project-brief/rubric-check')
  async saveRubricCheck(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Body() body: RubricCheckDto,
  ) {
    return this.learningService.saveRubricCheck(principal, id, body);
  }
}

export const learningProviders: Provider[] = [
  {
    provide: SkillsLearningService,
    useFactory: (db: DatabaseService, metering: MeteringService, model: TextModel) =>
      new SkillsLearningService(db.connectionPool, metering, model),
    inject: [DatabaseService, MeteringService, TEXT_MODEL],
  },
];
