import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Provider,
} from '@nestjs/common';
import { IsBoolean, IsUUID } from 'class-validator';
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
    const out = await this.actionEngine.create(principal, body, idempotencyKey);
    return {
      actionPack: out.result,
      usage: { ...out.usage, renewalDate: out.usage.renewalDate.toISOString() },
      jobId: out.jobId,
      replayed: out.replayed,
    };
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
}

export const actionEngineProviders: Provider[] = [
  {
    provide: ActionEngineService,
    inject: [DatabaseService, MeteringService, TEXT_MODEL],
    useFactory: (db: DatabaseService, metering: MeteringService, model: TextModel) =>
      new ActionEngineService(db.connectionPool, metering, model),
  },
];
