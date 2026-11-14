import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { positiveInt } from './paging';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { CRMAuditService } from './crm-audit.service';
import { FirebaseAuthGuard } from '../../common/guards/firebase-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

@ApiTags('crm-audit')
@Controller('crm/audit')
@UseGuards(FirebaseAuthGuard, RolesGuard)
@Roles('admin', 'super_admin')
@ApiBearerAuth()
export class CRMAuditController {
  constructor(private readonly auditService: CRMAuditService) {}

  @Get()
  list(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('action') action?: string,
    @Query('actorId') actorId?: string,
    @Query('targetType') targetType?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.auditService.list({
      page: positiveInt(page, 1),
      limit: positiveInt(limit, 50),
      action,
      actorId,
      targetType,
      startDate,
      endDate,
    });
  }
}
