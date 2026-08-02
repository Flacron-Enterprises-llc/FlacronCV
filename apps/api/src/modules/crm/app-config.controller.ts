import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CRMSettingsService } from './crm-settings.service';

/**
 * PUBLIC (unauthenticated) read of the operator-controlled app settings the web
 * client needs on every load — the announcement banner, maintenance state, and
 * feature flags. Deliberately exposes ONLY these non-sensitive fields (never
 * plan limits or updatedBy). This is what makes the super-admin CRM Settings
 * page actually take effect in the product.
 */
@ApiTags('app-config')
@Controller('app-config')
export class AppConfigController {
  constructor(private readonly settings: CRMSettingsService) {}

  @Get()
  async getPublicConfig() {
    const s = await this.settings.getSettings();
    return {
      maintenanceMode: {
        enabled: s.maintenanceMode.enabled,
        message: s.maintenanceMode.message,
      },
      announcement: {
        enabled: s.announcement.enabled,
        message: s.announcement.enabled ? s.announcement.message : '',
        type: s.announcement.type,
      },
      featureFlags: s.featureFlags,
    };
  }
}
