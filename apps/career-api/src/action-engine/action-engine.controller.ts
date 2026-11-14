import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Provider,
  Query,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsObject, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import type { Response } from 'express';
import {
  ActionEngineService,
  MeteringService,
  type Principal,
  type TextModel,
} from '@flacroncv/career-server';
import { TEXT_MODEL } from '../ai/ai.providers';
import { CurrentPrincipal } from '../auth/auth.guard';
import { DatabaseService } from '../database/database.service';
import { IdempotencyKey } from '../metering/metering.providers';

class CreateActionPackDto {
  @IsUUID()
  opportunityId!: string;
}

class UpdateChecklistDto {
  @IsBoolean()
  done!: boolean;
}

class RetryComponentDto {
  @IsIn(['coverLetter'])
  component!: 'coverLetter';
}

/**
 * Shape only; the service checks every field (limits, and that résumé lines
 * name confirmed facts frozen in the pack) with the shared edit rules.
 */
class EditActionPackDto {
  @IsOptional()
  @IsObject()
  fit?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  tailoredResume?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  coverLetter?: Record<string, unknown>;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  checklist?: unknown[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  @MaxLength(500, { each: true })
  nextSteps?: string[];
}

class SaveDocumentsDto {
  @IsOptional()
  @IsArray()
  @IsIn(['tailoredResume', 'coverLetter'], { each: true })
  components?: Array<'tailoredResume' | 'coverLetter'>;
}

class ExportQuery {
  @IsIn(['tailoredResume', 'coverLetter'])
  component!: 'tailoredResume' | 'coverLetter';

  @IsIn(['pdf', 'docx'])
  format!: 'pdf' | 'docx';
}

@Controller('action-packs')
export class ActionEngineController {
  constructor(
    @Inject(ActionEngineService)
    private readonly actionEngine: ActionEngineService,
  ) {}

  @Get()
  async list(@CurrentPrincipal() principal: Principal) {
    return this.actionEngine.list(principal);
  }

  @Get(':id')
  async get(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
  ) {
    return this.actionEngine.get(principal, id);
  }

  @Post()
  async create(
    @CurrentPrincipal() principal: Principal,
    @Body() body: CreateActionPackDto,
    @IdempotencyKey() idempotencyKey: string | undefined,
  ) {
    return this.paid(this.actionEngine.create(principal, body, idempotencyKey));
  }

  /** Retries a failed component under the pack's existing reservation; no new credit. */
  @Post(':id/retry')
  @HttpCode(200)
  async retry(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Body() body: RetryComponentDto,
  ) {
    return this.paid(this.actionEngine.retry(principal, id, body.component));
  }

  /** Gives up on an unfinished pack; the held credit is returned. */
  @Delete(':id')
  async cancel(@CurrentPrincipal() principal: Principal, @Param('id') id: string) {
    return this.actionEngine.cancel(principal, id);
  }

  @Patch(':id')
  async update(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Body() body: EditActionPackDto,
  ) {
    return this.actionEngine.update(principal, id, body);
  }

  @Patch(':id/checklist/:checklistId')
  async updateChecklist(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Param('checklistId') checklistId: string,
    @Body() body: UpdateChecklistDto,
  ) {
    return this.actionEngine.updateChecklist(principal, id, checklistId, body.done);
  }

  @Post(':id/documents')
  @HttpCode(200)
  async saveToDocuments(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Body() body: SaveDocumentsDto,
  ) {
    return this.actionEngine.saveToDocuments(principal, id, body);
  }

  @Get(':id/export')
  async export(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Query() query: ExportQuery,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const file = await this.actionEngine.exportComponent(principal, id, query.component, query.format);
    response.setHeader('Content-Type', file.contentType);
    response.setHeader('Content-Disposition', `attachment; filename="${file.fileName}"`);
    return new StreamableFile(file.bytes);
  }

  private async paid(pending: ReturnType<ActionEngineService['create']>) {
    const out = await pending;
    return {
      actionPack: out.result,
      usage: { ...out.usage, renewalDate: out.usage.renewalDate.toISOString() },
      jobId: out.jobId,
      replayed: out.replayed,
    };
  }
}

export const actionEngineProviders: Provider[] = [
  {
    provide: ActionEngineService,
    inject: [DatabaseService, MeteringService, TEXT_MODEL],
    useFactory: (db: DatabaseService, metering: MeteringService, model: TextModel) =>
      new ActionEngineService(db.connectionPool, metering, model),
  },
];
