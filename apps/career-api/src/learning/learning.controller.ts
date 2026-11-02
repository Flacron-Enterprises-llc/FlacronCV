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
} from '@nestjs/common';
import { IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';
import {
  SkillsLearningService,
  MeteringService,
  type Principal,
} from '@flacroncv/career-server';
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
  ) {
    return this.learningService.convertToEvidence(principal, id, milestoneId);
  }
}

export const learningProviders: Provider[] = [
  {
    provide: SkillsLearningService,
    useFactory: (db: DatabaseService, metering: MeteringService) =>
      new SkillsLearningService(db.connectionPool, metering),
    inject: [DatabaseService, MeteringService],
  },
];
