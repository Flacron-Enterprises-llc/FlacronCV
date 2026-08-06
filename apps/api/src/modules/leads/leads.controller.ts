import { Body, Controller, Get, HttpCode, HttpStatus, Ip, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { LeadsService } from './leads.service';
import { CreateLeadDto } from './dto/create-lead.dto';

/**
 * Public (unauthenticated) marketing lead capture + double-opt-in.
 * Confirm/unsubscribe are actioned by unguessable tokens; a tighter per-route
 * throttle sits on top of the global one to blunt spam/abuse.
 */
@ApiTags('leads')
@Controller('leads')
export class LeadsController {
  constructor(private readonly leadsService: LeadsService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  capture(@Body() data: CreateLeadDto, @Ip() ip: string) {
    return this.leadsService.capture(data, { ip });
  }

  @Get('confirm')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  confirm(@Query('token') token: string) {
    return this.leadsService.confirm(token);
  }

  @Get('unsubscribe')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  unsubscribe(@Query('token') token: string) {
    return this.leadsService.unsubscribe(token);
  }
}
