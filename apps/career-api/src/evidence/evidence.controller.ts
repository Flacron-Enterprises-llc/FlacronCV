import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Inject,
  Param,
  Patch,
  Post,
  Provider,
  Put,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import {
  EVIDENCE_TYPES,
  EvidenceType,
  CreateEvidenceInput,
  UpdateEvidenceInput,
} from '@flacroncv/career-shared';
import { EvidenceService, evidenceUploadMaxBytes, type ObjectStorage, type Principal } from '@flacroncv/career-server';
import { CurrentPrincipal } from '../auth/auth.guard';
import { DatabaseService } from '../database/database.service';
import { OBJECT_STORAGE } from '../storage/storage.providers';

class CreateEvidenceDto implements CreateEvidenceInput {
  @IsString()
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string;

  @IsIn([...EVIDENCE_TYPES])
  evidenceType!: EvidenceType;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  ownershipStatement?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  linkedSkills?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  attachmentUrl?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  attachmentName?: string | null;

  @IsOptional()
  @IsNumber()
  attachmentSizeBytes?: number | null;

  @IsOptional()
  @IsBoolean()
  isPortfolioShared?: boolean;

  @IsOptional()
  @IsArray()
  @IsUUID('all', { each: true })
  linkedFactIds?: string[];

  @IsOptional()
  @IsBoolean()
  confidential?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  redactionNote?: string | null;

  @IsOptional()
  @IsBoolean()
  redactionConfirmed?: boolean;
}

class UpdateEvidenceDto implements UpdateEvidenceInput {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  ownershipStatement?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  linkedSkills?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  attachmentUrl?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  attachmentName?: string | null;

  @IsOptional()
  @IsNumber()
  attachmentSizeBytes?: number | null;

  @IsOptional()
  @IsBoolean()
  isPortfolioShared?: boolean;

  @IsOptional()
  @IsArray()
  @IsUUID('all', { each: true })
  linkedFactIds?: string[];

  @IsOptional()
  @IsBoolean()
  confidential?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  redactionNote?: string | null;

  @IsOptional()
  @IsBoolean()
  redactionConfirmed?: boolean;
}

@Controller('evidence')
export class EvidenceController {
  constructor(
    @Inject(EvidenceService)
    private readonly evidenceService: EvidenceService,
  ) {}

  @Get()
  async list(@CurrentPrincipal() principal: Principal) {
    return this.evidenceService.list(principal);
  }

  @Get(':id')
  async get(@CurrentPrincipal() principal: Principal, @Param('id') id: string) {
    return this.evidenceService.get(principal, id);
  }

  @Post()
  async create(
    @CurrentPrincipal() principal: Principal,
    @Body() body: CreateEvidenceDto,
  ) {
    return this.evidenceService.create(principal, body);
  }

  @Patch(':id')
  async update(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Body() body: UpdateEvidenceDto,
  ) {
    return this.evidenceService.update(principal, id, body);
  }

  /**
   * Raw file body with its own Content-Type (PDF, PNG, JPEG, DOCX) and an
   * optional URL-encoded `X-File-Name`. The server checks ownership, type,
   * size, and storage capacity; it never spends a document credit.
   */
  @Put(':id/attachment')
  async upload(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Req() req: Request,
    @Headers('content-type') contentType?: string,
    @Headers('x-file-name') fileName?: string,
  ) {
    return this.evidenceService.uploadAttachment(principal, id, {
      body: req.body,
      contentType,
      fileName: decodeFileName(fileName),
    });
  }

  /** A short-lived download link for the caller's own stored file. */
  @Get(':id/attachment')
  async attachmentLink(@CurrentPrincipal() principal: Principal, @Param('id') id: string) {
    return this.evidenceService.attachmentLink(principal, id);
  }

  @Delete(':id/attachment')
  async removeAttachment(@CurrentPrincipal() principal: Principal, @Param('id') id: string) {
    return this.evidenceService.removeAttachment(principal, id);
  }

  @Delete(':id')
  async delete(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
  ) {
    await this.evidenceService.delete(principal, id);
    return { ok: true };
  }
}

export const evidenceProviders: Provider[] = [
  {
    provide: EvidenceService,
    useFactory: (db: DatabaseService, storage: ObjectStorage) =>
      new EvidenceService(db.connectionPool, undefined, storage, { maxUploadBytes: evidenceUploadMaxBytes(process.env) }),
    inject: [DatabaseService, OBJECT_STORAGE],
  },
];

/** `X-File-Name` is URL-encoded by the client; a malformed value falls back to no name. */
function decodeFileName(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    return decodeURIComponent(value).slice(0, 255);
  } catch {
    return undefined;
  }
}
