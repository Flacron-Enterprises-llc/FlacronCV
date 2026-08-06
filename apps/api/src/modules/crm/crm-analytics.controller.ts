import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { CRMAnalyticsService } from './crm-analytics.service';
import { AnalyticsRangeDto } from './dto/analytics-range.dto';
import { FirebaseAuthGuard } from '../../common/guards/firebase-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

@ApiTags('crm-analytics')
@Controller('crm/analytics')
@UseGuards(FirebaseAuthGuard, RolesGuard)
@Roles('admin', 'super_admin')
@ApiBearerAuth()
export class CRMAnalyticsController {
  constructor(private readonly analyticsService: CRMAnalyticsService) {}

  // All three accept an optional inclusive `from`/`to` window. Without it they
  // behave exactly as before (all time), so the default dashboard is unchanged.
  //
  // These params are not decorative: the dashboard states the active range in
  // the UI and writes it into the CSV export, so returning unfiltered figures
  // for a selected window would label real numbers as something they are not.

  @Get('overview')
  getOverview(@Query() range: AnalyticsRangeDto) {
    return this.analyticsService.getOverview(range);
  }

  @Get('revenue-chart')
  getRevenueChart(@Query() range: AnalyticsRangeDto) {
    return this.analyticsService.getRevenueChart(range);
  }

  @Get('customer-growth')
  getCustomerGrowth(@Query() range: AnalyticsRangeDto) {
    return this.analyticsService.getCustomerGrowthChart(range);
  }
}
