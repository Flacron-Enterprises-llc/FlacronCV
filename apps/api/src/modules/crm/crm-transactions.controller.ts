import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { csvCell } from '../../common/utils/csv';
import { toIsoString } from '../../common/utils/date';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { CRMTransactionsService } from './crm-transactions.service';
import { FirebaseAuthGuard } from '../../common/guards/firebase-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CreateCRMTransactionDto, CRMTransactionStatus } from '@flacroncv/shared-types';

@ApiTags('crm-transactions')
@Controller('crm/transactions')
@UseGuards(FirebaseAuthGuard, RolesGuard)
@Roles('admin', 'super_admin')
@ApiBearerAuth()
export class CRMTransactionsController {
  constructor(private readonly transactionsService: CRMTransactionsService) {}

  @Post()
  create(@Body() dto: CreateCRMTransactionDto) {
    return this.transactionsService.create(dto);
  }

  @Get()
  list(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('customerId') customerId?: string,
    @Query('status') status?: CRMTransactionStatus,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.transactionsService.list({
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
      customerId,
      status,
      startDate,
      endDate,
    });
  }

  @Get('export/csv')
  async exportCsv(
    @Res() res: Response,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const transactions = await this.transactionsService.getAllForExport(startDate, endDate);

    const header = [
      'ID', 'Customer ID', 'Customer Name', 'Amount', 'Currency',
      'Payment Method', 'Description', 'Date', 'Status', 'Created At',
    ].join(',');

    const rows = transactions.map((t) =>
      [
        t.id,
        t.customerId,
        csvCell(t.customerName),
        t.amount.toFixed(2),
        t.currency,
        t.paymentMethod ?? '',
        csvCell(t.description),
        toIsoString(t.date),
        t.status,
        toIsoString(t.createdAt),
      ].join(','),
    );

    const csv = [header, ...rows].join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="transactions.csv"');
    res.send(csv);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.transactionsService.findById(id);
  }

  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.transactionsService.delete(id);
  }
}
