import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AdminService } from './admin.service';
import { UsersService } from '../users/users.service';
import { SupportService } from '../support/support.service';
import { AuditService } from '../audit/audit.service';
import { FirebaseAuthGuard } from '../../common/guards/firebase-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, FirebaseUser } from '../../common/decorators/current-user.decorator';
import { AddMessageDto } from '../support/dto/add-message.dto';
import { UpdateUserData, SupportTicket } from '@flacroncv/shared-types';

@ApiTags('admin')
@Controller('admin')
@UseGuards(FirebaseAuthGuard, RolesGuard)
@Roles('admin', 'super_admin')
@ApiBearerAuth()
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly usersService: UsersService,
    private readonly supportService: SupportService,
    private readonly audit: AuditService,
  ) {}

  @Get('stats')
  async getStats() {
    return this.adminService.getStats();
  }

  @Get('users')
  async listUsers(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('role') role?: string,
    @Query('plan') plan?: string,
  ) {
    return this.usersService.listUsers(page || 1, limit || 20, { role, plan });
  }

  @Get('users/:id')
  async getUser(@Param('id') id: string) {
    return this.usersService.findByIdOrThrow(id);
  }

  @Patch('users/:id')
  async updateUser(
    @CurrentUser() actor: FirebaseUser,
    @Param('id') id: string,
    @Body() data: UpdateUserData,
  ) {
    const result = await this.usersService.update(id, data);
    await this.audit.log({
      actorId: actor.uid,
      actorEmail: actor.email,
      actorRole: actor.role,
      action: 'ADMIN_USER_UPDATED',
      resource: 'user',
      resourceId: id,
      metadata: { patch: data as Record<string, unknown> },
    });
    return result;
  }

  @Get('tickets')
  async listTickets(
    @Query('status') status?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.supportService.listAll(status, page || 1, limit || 20);
  }

  // Admin-scoped single-ticket read (ticket + message thread). The user-side
  // GET /support/tickets/:id enforces ownership, so admins can't use it; this
  // endpoint is gated by the class-level @Roles('admin','super_admin') instead.
  @Get('tickets/:id')
  async getTicket(@Param('id') id: string) {
    const ticket = await this.supportService.getTicket(id);
    const messages = await this.supportService.getMessages(id);
    return { ticket, messages };
  }

  // Admin reply to a ticket. Posts as authorRole 'admin' (so addMessage moves the
  // ticket to WAITING_ON_CUSTOMER) and audit-logs the action. The customer-facing
  // author name is a generic label so staff emails aren't exposed in the thread;
  // the acting admin is captured via authorId + the audit log.
  @Post('tickets/:id/messages')
  async replyToTicket(
    @CurrentUser() actor: FirebaseUser,
    @Param('id') id: string,
    @Body() body: AddMessageDto,
  ) {
    await this.supportService.getTicket(id); // 404 if the ticket doesn't exist
    const message = await this.supportService.addMessage(
      id,
      actor.uid,
      'Support Team',
      'admin',
      body.content,
    );
    await this.audit.log({
      actorId: actor.uid,
      actorEmail: actor.email,
      actorRole: actor.role,
      action: 'ADMIN_TICKET_REPLIED',
      resource: 'ticket',
      resourceId: id,
      metadata: { messageId: message.id },
    });
    return message;
  }

  // Internal notes on a ticket — agent-only commentary the customer must never
  // see. Notes live in the same `messages` subcollection flagged `internal`, and
  // SupportService.getMessages (the read behind the customer-facing
  // GET /support/tickets/:id, and behind GET /admin/tickets/:id above) filters
  // them out. They are served from this dedicated route instead, so the ONLY way
  // a note reaches a client is through this class-level
  // @Roles('admin','super_admin') controller.
  @Get('tickets/:id/notes')
  async listInternalNotes(@Param('id') id: string) {
    await this.supportService.getTicket(id); // 404 if the ticket doesn't exist
    return this.supportService.getInternalNotes(id);
  }

  // Posting a note deliberately does NOT move the ticket to WAITING_ON_CUSTOMER
  // the way an admin reply does (see SupportService.addInternalNote) — a note is
  // not a reply. Unlike a reply, the author is the acting admin rather than the
  // generic "Support Team": the customer never sees a note, and agents need to
  // know which colleague wrote it.
  @Post('tickets/:id/notes')
  async addInternalNote(
    @CurrentUser() actor: FirebaseUser,
    @Param('id') id: string,
    @Body() body: AddMessageDto,
  ) {
    await this.supportService.getTicket(id); // 404 if the ticket doesn't exist
    const note = await this.supportService.addInternalNote(
      id,
      actor.uid,
      actor.email || actor.uid,
      body.content,
    );
    await this.audit.log({
      actorId: actor.uid,
      actorEmail: actor.email,
      actorRole: actor.role,
      action: 'ADMIN_TICKET_NOTE_ADDED',
      resource: 'ticket',
      // The note body is deliberately NOT copied into the audit metadata: the
      // audit log is read by a wider admin audience than the ticket itself.
      resourceId: id,
      metadata: { noteId: note.id },
    });
    return note;
  }

  @Patch('tickets/:id')
  async updateTicket(
    @CurrentUser() actor: FirebaseUser,
    @Param('id') id: string,
    @Body() data: Partial<SupportTicket>,
  ) {
    const result = await this.supportService.updateTicket(id, data);
    await this.audit.log({
      actorId: actor.uid,
      actorEmail: actor.email,
      actorRole: actor.role,
      action: 'ADMIN_TICKET_UPDATED',
      resource: 'ticket',
      resourceId: id,
      metadata: { patch: data as Record<string, unknown> },
    });
    return result;
  }

  @Get('audit-logs')
  async getAuditLogs(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('action') action?: string,
  ) {
    return this.adminService.getAuditLogs(
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 50,
      action,
    );
  }

  @Get('analytics/revenue')
  async getRevenueAnalytics() {
    return this.adminService.getRevenueAnalytics();
  }
}
