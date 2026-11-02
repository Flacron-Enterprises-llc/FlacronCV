import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Patch, Post, Provider } from '@nestjs/common';
import { IsIn, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';
import { CareerProfileService } from '@flacroncv/career-server';
import type { Principal, TextModel } from '@flacroncv/career-server';
import { FACT_TYPES } from '@flacroncv/career-shared';
import { TEXT_MODEL } from '../ai/ai.providers';
import { CurrentPrincipal } from '../auth/auth.guard';
import { DatabaseService } from '../database/database.service';

class CreateFactDto {
  @IsIn(FACT_TYPES)
  factType!: string;

  @IsObject()
  value!: Record<string, unknown>;

  @IsOptional()
  @IsIn(['manual', 'paste'])
  source?: string;

  @IsOptional()
  @IsIn(['draft', 'confirmed'])
  confirmation?: string;
}

class UpdateFactDto {
  @IsObject()
  value!: Record<string, unknown>;
}

class PreferencesDto {
  @IsObject()
  preferences!: Record<string, unknown>;
}

class ImportDto {
  @IsString()
  text!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  fileName?: string;

  @IsOptional()
  @IsIn(['pdf', 'docx', 'text'])
  format?: string;
}

export const profileProviders: Provider[] = [
  {
    provide: CareerProfileService,
    inject: [DatabaseService, TEXT_MODEL],
    useFactory: (database: DatabaseService, model: TextModel) => new CareerProfileService(database.connectionPool, model),
  },
];

/**
 * API_CONTRACT "Career facts". No route here reserves a unit. Fact
 * values are checked by the shared schema in the service, so the DTOs
 * only check the envelope.
 */
@Controller()
export class ProfileController {
  constructor(private readonly profiles: CareerProfileService) {}

  @Get('facts')
  list(@CurrentPrincipal() principal: Principal) {
    return this.profiles.listFacts(principal);
  }

  @Post('facts')
  create(@CurrentPrincipal() principal: Principal, @Body() body: CreateFactDto) {
    return this.profiles.createFact(principal, body);
  }

  @Get('facts/:factId')
  get(@CurrentPrincipal() principal: Principal, @Param('factId') factId: string) {
    return this.profiles.getFact(principal, factId);
  }

  @Get('facts/:factId/revisions')
  async revisions(@CurrentPrincipal() principal: Principal, @Param('factId') factId: string) {
    return { items: await this.profiles.history(principal, factId) };
  }

  @Patch('facts/:factId')
  update(@CurrentPrincipal() principal: Principal, @Param('factId') factId: string, @Body() body: UpdateFactDto) {
    return this.profiles.updateFact(principal, factId, body.value);
  }

  @Post('facts/:factId/confirm')
  @HttpCode(200)
  confirm(@CurrentPrincipal() principal: Principal, @Param('factId') factId: string) {
    return this.profiles.confirmFact(principal, factId);
  }

  @Delete('facts/:factId')
  async remove(@CurrentPrincipal() principal: Principal, @Param('factId') factId: string) {
    await this.profiles.deleteFact(principal, factId);
    return { ok: true };
  }

  @Get('profile')
  profile(@CurrentPrincipal() principal: Principal) {
    return this.profiles.profile(principal);
  }

  @Patch('profile/preferences')
  preferences(@CurrentPrincipal() principal: Principal, @Body() body: PreferencesDto) {
    return this.profiles.setPreferences(principal, body.preferences);
  }

  @Get('imports/allowance')
  allowance(@CurrentPrincipal() principal: Principal) {
    return this.profiles.importAllowance(principal);
  }

  @Post('imports')
  import(@CurrentPrincipal() principal: Principal, @Body() body: ImportDto) {
    return this.profiles.importResume(principal, body);
  }
}
