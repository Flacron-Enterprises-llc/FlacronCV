import { Controller, Get, Post, Patch, Param, Body, UseGuards, ForbiddenException } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { SupportService } from './support.service';
import { FirebaseAuthGuard } from '../../common/guards/firebase-auth.guard';
import { CurrentUser, FirebaseUser } from '../../common/decorators/current-user.decorator';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { AddMessageDto } from './dto/add-message.dto';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/audit-actions';

@ApiTags('support')
@Controller('support')
@UseGuards(FirebaseAuthGuard)
@ApiBearerAuth()
export class SupportController {
  constructor(
    private readonly supportService: SupportService,
    private readonly audit: AuditService,
  ) {}

  // Tighter per-route limits on top of the global throttler to blunt ticket/message
  // spam (each creates Firestore writes; bodies are now length-capped by the DTOs).
  @Post('tickets')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async create(@CurrentUser() user: FirebaseUser, @Body() data: CreateTicketDto) {
    const ticket = await this.supportService.createTicket(user.uid, user.email, user.email, data);
    await this.audit.logUserAction(
      AuditAction.TICKET_CREATED,
      { uid: user.uid, email: user.email },
      'ticket',
      ticket.id,
      // Subject only — the message body is the customer's own content.
      { metadata: { subject: ticket.subject, category: ticket.category, priority: ticket.priority } },
    );
    return ticket;
  }

  @Get('tickets')
  async list(@CurrentUser() user: FirebaseUser) {
    return this.supportService.listByUser(user.uid);
  }

  @Get('tickets/:id')
  async getTicket(@CurrentUser() user: FirebaseUser, @Param('id') id: string) {
    const ticket = await this.supportService.getTicket(id);
    if (ticket.userId !== user.uid) throw new ForbiddenException('Access denied');
    const messages = await this.supportService.getMessages(id);
    return { ticket, messages };
  }

  @Post('tickets/:id/messages')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  async addMessage(
    @CurrentUser() user: FirebaseUser,
    @Param('id') id: string,
    @Body() body: AddMessageDto,
  ) {
    const ticket = await this.supportService.getTicket(id);
    if (ticket.userId !== user.uid) throw new ForbiddenException('Access denied');
    return this.supportService.addMessage(id, user.uid, user.email, 'user', body.content);
  }

  @Patch('tickets/:id/close')
  async close(@CurrentUser() user: FirebaseUser, @Param('id') id: string) {
    const ticket = await this.supportService.getTicket(id);
    if (ticket.userId !== user.uid) throw new ForbiddenException('Access denied');
    const closed = await this.supportService.closeTicket(id);
    await this.audit.logUserAction(
      AuditAction.TICKET_CLOSED,
      { uid: user.uid, email: user.email },
      'ticket',
      id,
      { metadata: { closedBy: 'customer' } },
    );
    return closed;
  }
}
