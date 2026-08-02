import { Controller, Get, Post, Put, Delete, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { TemplatesService } from './templates.service';
import { FirebaseAuthGuard } from '../../common/guards/firebase-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, FirebaseUser } from '../../common/decorators/current-user.decorator';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/audit-actions';
import { TemplateCategory, SubscriptionPlan, Template } from '@flacroncv/shared-types';

@ApiTags('templates')
@Controller('templates')
export class TemplatesController {
  constructor(
    private readonly templatesService: TemplatesService,
    private readonly audit: AuditService,
  ) {}

  /** Normalise the acting admin into the shape the audit service expects. */
  private static actor(user: FirebaseUser) {
    return {
      uid: user.uid,
      email: user.email,
      role: (user as Record<string, unknown>).role as string,
    };
  }

  /** The same actor as the flat fields `AuditService.log` takes directly. */
  private static actorEntry(user: FirebaseUser) {
    const a = TemplatesController.actor(user);
    return { actorId: a.uid, actorEmail: a.email || 'unknown', actorRole: a.role || 'admin' };
  }

  @Get()
  async list(
    @Query('category') category?: TemplateCategory,
    @Query('tier') tier?: SubscriptionPlan,
  ) {
    // Public endpoint → data-minimized (no render templates / creator uid).
    return this.templatesService.listPublic(category, tier);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.templatesService.findPublicById(id);
  }

  @Post()
  @UseGuards(FirebaseAuthGuard, RolesGuard)
  @Roles('admin', 'super_admin')
  @ApiBearerAuth()
  async create(@CurrentUser() user: FirebaseUser, @Body() data: Partial<Template>) {
    const template = await this.templatesService.create(data, user.uid);
    await this.audit.logUserAction(
      AuditAction.TEMPLATE_CREATED,
      TemplatesController.actor(user),
      'template',
      template.id,
      { metadata: { name: template.name, tier: template.tier, category: template.category } },
    );
    return template;
  }

  @Put(':id')
  @UseGuards(FirebaseAuthGuard, RolesGuard)
  @Roles('admin', 'super_admin')
  @ApiBearerAuth()
  async update(
    @Param('id') id: string,
    @Body() data: Partial<Template>,
    @CurrentUser() user: FirebaseUser,
  ) {
    // Read first so the audit row can show a real before/after diff.
    const before = await this.templatesService.findById(id).catch(() => null);
    const template = await this.templatesService.update(id, data);
    await this.audit.log({
      ...TemplatesController.actorEntry(user),
      action: AuditAction.TEMPLATE_UPDATED,
      resource: 'template',
      resourceId: id,
      changes: {
        before: before ? { name: before.name, tier: before.tier, isActive: before.isActive } : null,
        after: { name: template.name, tier: template.tier, isActive: template.isActive },
      },
    });
    return template;
  }

  @Delete(':id')
  @UseGuards(FirebaseAuthGuard, RolesGuard)
  @Roles('admin', 'super_admin')
  @ApiBearerAuth()
  async delete(@Param('id') id: string, @CurrentUser() user: FirebaseUser) {
    const before = await this.templatesService.findById(id).catch(() => null);
    await this.templatesService.delete(id);
    await this.audit.logUserAction(
      AuditAction.TEMPLATE_DELETED,
      TemplatesController.actor(user),
      'template',
      id,
      // Deletion is a soft archive (isActive:false), so the row is recoverable.
      { metadata: { name: before?.name ?? null, archived: true } },
    );
    return { message: 'Template archived' };
  }
}
