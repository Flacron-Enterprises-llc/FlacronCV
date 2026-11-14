import { Body, Controller, Get, Inject, Param, Patch, Post, Query, Res, StreamableFile, Provider } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsDateString, IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, MaxLength, Min, ValidateNested } from 'class-validator';
import type { Response } from 'express';
import { MeteringService, WritingService } from '@flacroncv/career-server';
import type { Principal, TextModel } from '@flacroncv/career-server';
import { COVER_LETTER_TEMPLATE_IDS, WRITING_CONTEXT_LIMITS, WRITING_TYPES } from '@flacroncv/career-shared';
import { TEXT_MODEL } from '../ai/ai.providers';
import { CurrentPrincipal } from '../auth/auth.guard';
import { DatabaseService } from '../database/database.service';
import { IdempotencyKey } from '../metering/metering.providers';

const LETTER_TEMPLATE_IDS = [...COVER_LETTER_TEMPLATE_IDS];

/** The person's own words about the target, for drafts with no saved listing (job tracker). */
class WritingContextDto {
  @IsOptional()
  @IsString()
  @MaxLength(WRITING_CONTEXT_LIMITS.organization)
  organization?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(WRITING_CONTEXT_LIMITS.role)
  role?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(WRITING_CONTEXT_LIMITS.contactName)
  contactName?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(WRITING_CONTEXT_LIMITS.contactRole)
  contactRole?: string | null;

  @IsOptional()
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  interviewDate?: string | null;
}

class CreateWritingDto {
  @IsIn(WRITING_TYPES)
  type!: string;

  @IsOptional()
  @IsUUID()
  opportunityId?: string | null;

  @IsOptional()
  @IsIn(LETTER_TEMPLATE_IDS)
  templateId?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => WritingContextDto)
  context?: WritingContextDto;
}

class UpdateWritingDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20000)
  body?: string;

  @IsOptional()
  @IsIn(['draft', 'confirmed'])
  confirmation?: string;

  @IsOptional()
  @IsIn(LETTER_TEMPLATE_IDS)
  templateId?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  expectedRevision?: number;
}

class ExportWritingQuery {
  @IsIn(['pdf', 'docx', 'txt'])
  format!: string;
}

export const writingProviders: Provider[] = [
  {
    provide: WritingService,
    inject: [DatabaseService, TEXT_MODEL, MeteringService],
    useFactory: (database: DatabaseService, model: TextModel, metering: MeteringService) =>
      new WritingService(database.connectionPool, model, metering),
  },
];

@Controller()
export class WritingController {
  constructor(@Inject(WritingService) private readonly writing: WritingService) {}

  @Get('writing')
  list(@CurrentPrincipal() principal: Principal) {
    return this.writing.list(principal);
  }

  @Get('writing/:documentId')
  get(@CurrentPrincipal() principal: Principal, @Param('documentId') documentId: string) {
    return this.writing.get(principal, documentId);
  }

  @Get('writing/:documentId/export')
  async export(
    @CurrentPrincipal() principal: Principal,
    @Param('documentId') documentId: string,
    @Query() query: ExportWritingQuery,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const file = await this.writing.exportDocument(principal, documentId, query.format);
    response.setHeader('Content-Type', file.contentType);
    response.setHeader('Content-Disposition', `attachment; filename="${file.fileName}"`);
    return new StreamableFile(file.bytes);
  }

  @Patch('writing/:documentId')
  update(
    @CurrentPrincipal() principal: Principal,
    @Param('documentId') documentId: string,
    @Body() body: UpdateWritingDto,
  ) {
    return this.writing.update(principal, documentId, body);
  }

  @Post('writing')
  async create(
    @CurrentPrincipal() principal: Principal,
    @Body() body: CreateWritingDto,
    @IdempotencyKey() idempotencyKey: string | undefined,
  ) {
    const out = await this.writing.create(principal, body, idempotencyKey);
    return {
      document: out.result,
      usage: { ...out.usage, renewalDate: out.usage.renewalDate.toISOString() },
      jobId: out.jobId,
      replayed: out.replayed,
    };
  }
}
