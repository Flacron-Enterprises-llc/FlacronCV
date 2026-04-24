import { Module } from '@nestjs/common';
import { CRMCustomersController } from './crm-customers.controller';
import { CRMCustomersService } from './crm-customers.service';
import { CRMLeadsController } from './crm-leads.controller';
import { CRMLeadsService } from './crm-leads.service';
import { CRMTransactionsController } from './crm-transactions.controller';
import { CRMTransactionsService } from './crm-transactions.service';
import { CRMAnalyticsController } from './crm-analytics.controller';
import { CRMAnalyticsService } from './crm-analytics.service';
import { CRMAuditController } from './crm-audit.controller';
import { CRMAuditService } from './crm-audit.service';
import { CRMUsersController } from './crm-users.controller';
import { CRMUsersService } from './crm-users.service';
import { CRMPlatformController } from './crm-platform.controller';
import { CRMPlatformService } from './crm-platform.service';
import { CRMSettingsController } from './crm-settings.controller';
import { CRMSettingsService } from './crm-settings.service';

@Module({
  controllers: [
    CRMCustomersController,
    CRMLeadsController,
    CRMTransactionsController,
    CRMAnalyticsController,
    CRMAuditController,
    CRMUsersController,
    CRMPlatformController,
    CRMSettingsController,
  ],
  providers: [
    CRMCustomersService,
    CRMLeadsService,
    CRMTransactionsService,
    CRMAnalyticsService,
    CRMAuditService,
    CRMUsersService,
    CRMPlatformService,
    CRMSettingsService,
  ],
  exports: [CRMCustomersService, CRMTransactionsService, CRMAuditService],
})
export class CRMModule {}
