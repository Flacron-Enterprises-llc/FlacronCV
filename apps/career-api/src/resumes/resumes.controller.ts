import { Body, Controller, Get, Inject, Param, Patch, Post, Query, Res, StreamableFile, Provider } from '@nestjs/common';
import { IsArray, IsIn, IsInt, IsOptional, IsString, IsUUID, MaxLength, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import type { Response } from 'express';
import { MeteringService, ResumeStudioService } from '@flacroncv/career-server';
import type { Principal, TextModel } from '@flacroncv/career-server';
import { LAUNCH_LOCALES, RESUME_TEMPLATES } from '@flacroncv/career-shared';
import { TEXT_MODEL } from '../ai/ai.providers';
import { CurrentPrincipal } from '../auth/auth.guard';
import { DatabaseService } from '../database/database.service';
import { IdempotencyKey } from '../metering/metering.providers';

const TEMPLATE_IDS = RESUME_TEMPLATES.map((template) => template.id);

class CreateResumeDto {
  @IsString()
  @MaxLength(200)
  title!: string;

  @IsIn(LAUNCH_LOCALES)
  language!: string;

  @IsOptional()
  @IsIn(TEMPLATE_IDS)
  templateId?: string;
}

class LineDto {
  @IsString()
  factId!: string;

  @IsString()
  @MaxLength(5000)
  text!: string;
}

class UpdateVersionDto {
  @IsOptional()
  @IsIn(TEMPLATE_IDS)
  templateId?: string;

  @IsOptional()
  @IsIn(['draft', 'confirmed'])
  confirmation?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LineDto)
  lines?: LineDto[];

  @IsOptional()
  @IsInt()
  @Min(1)
  expectedRevision?: number;
}

class GenerateDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  instructions?: string;
}

class TailorDto {
  @IsUUID()
  opportunityId!: string;
}

class ExportQuery {
  @IsIn(['pdf', 'docx'])
  format!: 'pdf' | 'docx';
}

export const resumeProviders: Provider[] = [
  {
    provide: ResumeStudioService,
    inject: [DatabaseService, TEXT_MODEL, MeteringService],
    useFactory: (database: DatabaseService, model: TextModel, metering: MeteringService) =>
      new ResumeStudioService(database.connectionPool, model, metering),
  },
];

@Controller()
export class ResumesController {
  constructor(@Inject(ResumeStudioService) private readonly resumes: ResumeStudioService) {}

  @Get('resumes')
  list(@CurrentPrincipal() principal: Principal) {
    return this.resumes.list(principal);
  }

  @Post('resumes')
  create(@CurrentPrincipal() principal: Principal, @Body() body: CreateResumeDto) {
    return this.resumes.create(principal, body);
  }

  @Get('resumes/:resumeId')
  get(@CurrentPrincipal() principal: Principal, @Param('resumeId') resumeId: string) {
    return this.resumes.get(principal, resumeId);
  }

  @Get('resumes/:resumeId/versions')
  versions(@CurrentPrincipal() principal: Principal, @Param('resumeId') resumeId: string) {
    return this.resumes.versions(principal, resumeId);
  }

  @Patch('resume-versions/:versionId')
  update(@CurrentPrincipal() principal: Principal, @Param('versionId') versionId: string, @Body() body: UpdateVersionDto) {
    return this.resumes.updateVersion(principal, versionId, body);
  }

  @Post('resumes/:resumeId/generate')
  generate(
    @CurrentPrincipal() principal: Principal,
    @Param('resumeId') resumeId: string,
    @Body() body: GenerateDto,
    @IdempotencyKey() idempotencyKey: string | undefined,
  ) {
    return this.paid(this.resumes.generate(principal, resumeId, body, idempotencyKey));
  }

  @Post('resumes/:resumeId/tailor')
  tailor(
    @CurrentPrincipal() principal: Principal,
    @Param('resumeId') resumeId: string,
    @Body() body: TailorDto,
    @IdempotencyKey() idempotencyKey: string | undefined,
  ) {
    return this.paid(this.resumes.tailor(principal, resumeId, body, idempotencyKey));
  }

  @Get('resume-versions/:versionId/readability')
  readability(@CurrentPrincipal() principal: Principal, @Param('versionId') versionId: string) {
    return this.resumes.readability(principal, versionId);
  }

  @Get('resume-versions/:versionId/export')
  async export(
    @CurrentPrincipal() principal: Principal,
    @Param('versionId') versionId: string,
    @Query() query: ExportQuery,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const file = await this.resumes.exportVersion(principal, versionId, query.format);
    response.setHeader('Content-Type', file.contentType);
    response.setHeader('Content-Disposition', `attachment; filename="${file.fileName}"`);
    return new StreamableFile(file.bytes);
  }

  private async paid(pending: ReturnType<ResumeStudioService['generate']>) {
    const out = await pending;
    return {
      version: out.result,
      usage: { ...out.usage, renewalDate: out.usage.renewalDate.toISOString() },
      jobId: out.jobId,
      replayed: out.replayed,
    };
  }
}
