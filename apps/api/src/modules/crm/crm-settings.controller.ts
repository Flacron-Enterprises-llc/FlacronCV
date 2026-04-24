import { Controller, Get, Put, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { CRMSettingsService } from './crm-settings.service';
import { FirebaseAuthGuard } from '../../common/guards/firebase-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, FirebaseUser } from '../../common/decorators/current-user.decorator';
import { UpdateAppSettingsDto } from '@flacroncv/shared-types';

@ApiTags('crm-settings')
@Controller('crm/settings')
@UseGuards(FirebaseAuthGuard, RolesGuard)
@Roles('super_admin')
@ApiBearerAuth()
export class CRMSettingsController {
  constructor(private readonly settingsService: CRMSettingsService) {}

  @Get()
  getSettings() {
    return this.settingsService.getSettings();
  }

  @Put()
  updateSettings(@Body() dto: UpdateAppSettingsDto, @CurrentUser() actor: FirebaseUser) {
    return this.settingsService.updateSettings(dto, actor.uid, actor.email);
  }
}
