import {
  Controller,
  Get,
  Delete,
  Param,
  Query,
  UseGuards,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { CRMSubscriptionsService } from './crm-subscriptions.service';
import { FirebaseAuthGuard } from '../../common/guards/firebase-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, FirebaseUser } from '../../common/decorators/current-user.decorator';

@ApiTags('crm-subscriptions')
@Controller('crm/subscriptions')
@UseGuards(FirebaseAuthGuard, RolesGuard)
@Roles('admin', 'super_admin')
@ApiBearerAuth()
export class CRMSubscriptionsController {
  constructor(private readonly service: CRMSubscriptionsService) {}

  @Get()
  list(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('plan') plan?: string,
    @Query('status') status?: string,
    @Query('userId') userId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.service.listSubscriptions({
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 25,
      plan,
      status,
      userId,
      startDate,
      endDate,
    });
  }

  @Get('export/csv')
  async exportCsv(@Res() res: Response) {
    const subs = await this.service.getAllForExport();

    const header = [
      'ID', 'User ID', 'Email', 'Display Name', 'Plan', 'Status',
      'Interval', 'Amount', 'Currency', 'Period Start', 'Period End',
      'Cancel At Period End', 'Created At',
    ].join(',');

    const rows = subs.map((s) =>
      [
        s.id,
        s.userId,
        `"${s.userEmail.replace(/"/g, '""')}"`,
        `"${s.userDisplayName.replace(/"/g, '""')}"`,
        s.plan,
        s.status,
        s.interval,
        (s.amount / 100).toFixed(2),
        s.currency.toUpperCase(),
        new Date(s.currentPeriodStart).toISOString(),
        new Date(s.currentPeriodEnd).toISOString(),
        s.cancelAtPeriodEnd ? 'true' : 'false',
        new Date(s.createdAt).toISOString(),
      ].join(','),
    );

    const csv = [header, ...rows].join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="subscriptions.csv"');
    res.send(csv);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.getSubscriptionById(id);
  }

  @Delete(':id/cancel')
  cancel(@Param('id') id: string, @CurrentUser() actor: FirebaseUser) {
    return this.service.cancelSubscription(id, actor.uid, actor.email);
  }
}
