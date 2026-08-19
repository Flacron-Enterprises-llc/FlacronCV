import {
  Controller,
  Get,
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
import { CRMUsersService } from './crm-users.service';
import { FirebaseAuthGuard } from '../../common/guards/firebase-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, FirebaseUser } from '../../common/decorators/current-user.decorator';
import { UpdateUserRoleDto } from './dto/update-user-role.dto';
import { UpdateUserPlanDto } from './dto/update-user-plan.dto';

@ApiTags('crm-users')
@Controller('crm/users')
@UseGuards(FirebaseAuthGuard, RolesGuard)
@Roles('admin', 'super_admin')
@ApiBearerAuth()
export class CRMUsersController {
  constructor(private readonly usersService: CRMUsersService) {}

  @Get()
  list(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('role') role?: string,
    @Query('plan') plan?: string,
    @Query('isActive') isActive?: string,
    @Query('sortBy') sortBy?: 'createdAt' | 'lastLoginAt' | 'displayName' | 'cvsCreated',
    @Query('sortOrder') sortOrder?: 'asc' | 'desc',
  ) {
    return this.usersService.listUsers({
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 25,
      search,
      role,
      plan,
      isActive: isActive !== undefined ? isActive === 'true' : undefined,
      sortBy,
      sortOrder,
    });
  }

  @Get('export/csv')
  async exportCsv(@Res() res: Response) {
    const users = await this.usersService.getAllForExport();

    const header = [
      'UID', 'Email', 'Display Name', 'Role', 'Plan', 'Plan Status',
      'CVs Created', 'Cover Letters', 'AI Credits Used', 'AI Credits Limit',
      'Exports This Month', 'Is Active', 'Created At', 'Last Login',
    ].join(',');

    const rows = users.map((u) =>
      [
        u.uid,
        csvCell(u.email),
        csvCell(u.displayName),
        u.role,
        u.subscription?.plan ?? 'free',
        u.subscription?.status ?? 'active',
        u.usage?.cvsCreated ?? 0,
        u.usage?.coverLettersCreated ?? 0,
        u.usage?.aiCreditsUsed ?? 0,
        u.usage?.aiCreditsLimit ?? 5,
        u.usage?.exportsThisMonth ?? 0,
        u.isActive ? 'true' : 'false',
        toIsoString(u.createdAt),
        toIsoString(u.lastLoginAt),
      ].join(','),
    );

    const csv = [header, ...rows].join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="platform-users.csv"');
    res.send(csv);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.usersService.getUserById(id);
  }

  // Role management is reserved for super_admin (overrides the class-level
  // @Roles('admin','super_admin')) — matches the super_admin-only /auth/set-claims
  // and prevents a plain admin from self-escalating to super_admin.
  @Put(':id/role')
  @Roles('super_admin')
  updateRole(
    @Param('id') id: string,
    @Body() dto: UpdateUserRoleDto,
    @CurrentUser() actor: FirebaseUser,
  ) {
    return this.usersService.updateUserRole(id, dto.role, actor.uid, actor.email);
  }

  @Put(':id/plan')
  updatePlan(
    @Param('id') id: string,
    @Body() dto: UpdateUserPlanDto,
    @CurrentUser() actor: FirebaseUser,
  ) {
    return this.usersService.updateUserPlan(id, dto.plan, dto.status ?? 'active', actor.uid, actor.email, actor.role);
  }

  @Put(':id/suspend')
  suspend(@Param('id') id: string, @CurrentUser() actor: FirebaseUser) {
    return this.usersService.suspendUser(id, actor.uid, actor.email, actor.role);
  }

  @Put(':id/reactivate')
  reactivate(@Param('id') id: string, @CurrentUser() actor: FirebaseUser) {
    return this.usersService.reactivateUser(id, actor.uid, actor.email, actor.role);
  }

  @Delete(':id/usage')
  resetUsage(@Param('id') id: string, @CurrentUser() actor: FirebaseUser) {
    return this.usersService.resetUsage(id, actor.uid, actor.email, actor.role);
  }

  @Put(':id/release-free-grant')
  releaseFreeGrant(@Param('id') id: string, @CurrentUser() actor: FirebaseUser) {
    return this.usersService.releaseFreeGrant(id, actor.uid, actor.role);
  }
}
