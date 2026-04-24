import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { CRMPlatformService } from './crm-platform.service';
import { FirebaseAuthGuard } from '../../common/guards/firebase-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

@ApiTags('crm-platform')
@Controller('crm/platform')
@UseGuards(FirebaseAuthGuard, RolesGuard)
@Roles('admin', 'super_admin')
@ApiBearerAuth()
export class CRMPlatformController {
  constructor(private readonly platformService: CRMPlatformService) {}

  @Get('overview')
  getOverview() {
    return this.platformService.getOverview();
  }

  @Get('user-growth')
  getUserGrowth() {
    return this.platformService.getUserGrowthChart();
  }

  @Get('usage-chart')
  getUsageChart() {
    return this.platformService.getUsageChart();
  }

  @Get('top-templates')
  getTopTemplates() {
    return this.platformService.getTopTemplates();
  }
}
