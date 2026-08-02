import {
  Controller,
  Get,
  Post,
  Put,
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
import { CRMCustomersService } from './crm-customers.service';
import { FirebaseAuthGuard } from '../../common/guards/firebase-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, FirebaseUser } from '../../common/decorators/current-user.decorator';
import {
  CreateCRMCustomerDto,
  UpdateCRMCustomerDto,
  AddCRMNoteDto,
  CRMCustomerStatus,
  CRMCustomerSource,
} from '@flacroncv/shared-types';

@ApiTags('crm-customers')
@Controller('crm/customers')
@UseGuards(FirebaseAuthGuard, RolesGuard)
@Roles('admin', 'super_admin')
@ApiBearerAuth()
export class CRMCustomersController {
  constructor(private readonly customersService: CRMCustomersService) {}

  @Post()
  create(@Body() dto: CreateCRMCustomerDto, @CurrentUser() user: FirebaseUser) {
    return this.customersService.create(dto, user.uid, user.email);
  }

  @Get()
  list(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('status') status?: CRMCustomerStatus,
    @Query('source') source?: CRMCustomerSource,
    @Query('sortBy') sortBy?: 'name' | 'createdAt' | 'totalRevenue' | 'lastActivity',
    @Query('sortOrder') sortOrder?: 'asc' | 'desc',
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.customersService.list({
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
      search,
      status,
      source,
      sortBy,
      sortOrder,
      startDate,
      endDate,
    });
  }

  @Get('export/csv')
  async exportCsv(@Res() res: Response) {
    const customers = await this.customersService.getAllForExport();

    const header = [
      'ID', 'Name', 'Email', 'Phone', 'Company',
      'Status', 'Source', 'Tags', 'Total Revenue',
      'Last Activity', 'Created At',
    ].join(',');

    const rows = customers.map((c) =>
      [
        c.id,
        csvCell(c.name),
        csvCell(c.email),
        c.phone ?? '',
        csvCell(c.company),
        c.status,
        c.source,
        `"${(c.tags ?? []).join('; ')}"`,
        c.totalRevenue.toFixed(2),
        toIsoString(c.lastActivity),
        toIsoString(c.createdAt),
      ].join(','),
    );

    const csv = [header, ...rows].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="customers.csv"');
    res.send(csv);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.customersService.findById(id);
  }

  @Put(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateCRMCustomerDto,
    @CurrentUser() user: FirebaseUser,
  ) {
    return this.customersService.update(id, dto, user.uid, user.email);
  }

  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.customersService.delete(id);
  }

  // ─── Notes ─────────────────────────────────────────────────────────────────

  @Post(':id/notes')
  addNote(
    @Param('id') id: string,
    @Body() dto: AddCRMNoteDto,
    @CurrentUser() user: FirebaseUser,
  ) {
    return this.customersService.addNote(id, dto, user.uid, user.email);
  }

  @Delete(':id/notes/:noteId')
  deleteNote(@Param('id') id: string, @Param('noteId') noteId: string) {
    return this.customersService.deleteNote(id, noteId);
  }

  // ─── Tags ──────────────────────────────────────────────────────────────────

  @Post(':id/tags')
  addTag(
    @Param('id') id: string,
    @Body('tag') tag: string,
    @CurrentUser() user: FirebaseUser,
  ) {
    return this.customersService.addTag(id, tag, user.uid, user.email);
  }

  @Delete(':id/tags/:tag')
  removeTag(
    @Param('id') id: string,
    @Param('tag') tag: string,
    @CurrentUser() user: FirebaseUser,
  ) {
    return this.customersService.removeTag(id, tag, user.uid, user.email);
  }

  // ─── Activity ──────────────────────────────────────────────────────────────

  @Get(':id/activities')
  getActivities(@Param('id') id: string) {
    return this.customersService.getActivities(id);
  }
}
