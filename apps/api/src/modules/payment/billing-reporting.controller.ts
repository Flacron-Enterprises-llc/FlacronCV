import { BadRequestException, Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { FirebaseAuthGuard } from '../../common/guards/firebase-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { BillingLedgerService } from './billing-ledger.service';
import { LedgerKind } from './billing-ledger';
import { PaymentService } from './payment.service';

const APPLICATION_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const LIST_LIMIT = 500;

/**
 * Billing ledger reads for the central management dashboard.
 *
 * Every endpoint is scoped by `application_id` — FlacronCV's own id by
 * default, `all` for the company-wide view — and by mode, so sandbox rows
 * never appear beside live ones. Admin-only.
 */
@ApiTags('billing-reporting')
@Controller('admin/billing')
@UseGuards(FirebaseAuthGuard, RolesGuard)
@Roles('admin', 'super_admin')
@ApiBearerAuth()
export class BillingReportingController {
  constructor(
    private readonly ledger: BillingLedgerService,
    private readonly payments: PaymentService,
  ) {}

  private scope(applicationId?: string, livemode?: string): { applicationId: string; livemode: boolean } {
    const app = (applicationId ?? '').trim() || this.payments.appId;
    if (app !== 'all' && !APPLICATION_ID.test(app)) {
      throw new BadRequestException('application_id must be an application id or "all"');
    }
    let mode = this.payments.livemode ?? false;
    if (livemode === 'true') mode = true;
    else if (livemode === 'false') mode = false;
    else if (livemode !== undefined && livemode !== '') {
      throw new BadRequestException('livemode must be "true" or "false"');
    }
    return { applicationId: app, livemode: mode };
  }

  @Get('revenue')
  revenue(@Query('application_id') applicationId?: string, @Query('livemode') livemode?: string) {
    const scope = this.scope(applicationId, livemode);
    return this.ledger.revenueReport(scope.applicationId, scope.livemode);
  }

  private async rows(kind: LedgerKind, applicationId?: string, livemode?: string) {
    const scope = this.scope(applicationId, livemode);
    const rows = await this.ledger.list<{ created_at?: unknown }>(kind, scope.applicationId, scope.livemode);
    const time = (v: unknown) => {
      const d = v as { toDate?: () => Date } | Date | string | undefined;
      if (!d) return 0;
      if (d instanceof Date) return d.getTime();
      if (typeof d === 'string') return new Date(d).getTime();
      return d.toDate ? d.toDate().getTime() : 0;
    };
    rows.sort((a, b) => time(b.created_at) - time(a.created_at));
    return { ...scope, count: rows.length, data: rows.slice(0, LIST_LIMIT) };
  }

  @Get('payments')
  listPayments(@Query('application_id') applicationId?: string, @Query('livemode') livemode?: string) {
    return this.rows('payments', applicationId, livemode);
  }

  @Get('subscriptions')
  listSubscriptions(@Query('application_id') applicationId?: string, @Query('livemode') livemode?: string) {
    return this.rows('subscriptions', applicationId, livemode);
  }

  @Get('refunds')
  listRefunds(@Query('application_id') applicationId?: string, @Query('livemode') livemode?: string) {
    return this.rows('refunds', applicationId, livemode);
  }

  @Get('invoices')
  listInvoices(@Query('application_id') applicationId?: string, @Query('livemode') livemode?: string) {
    return this.rows('invoices', applicationId, livemode);
  }

  @Get('customers')
  listCustomers(@Query('application_id') applicationId?: string, @Query('livemode') livemode?: string) {
    return this.rows('customers', applicationId, livemode);
  }
}
