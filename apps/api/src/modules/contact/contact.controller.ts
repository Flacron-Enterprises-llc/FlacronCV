import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ContactService, ContactMessageInput } from './contact.service';

// Public (unauthenticated) endpoint for the marketing contact form. A tighter
// per-route rate limit sits on top of the global throttler to blunt spam/abuse.
@ApiTags('contact')
@Controller('contact')
export class ContactController {
  constructor(private readonly contactService: ContactService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async submit(@Body() data: ContactMessageInput) {
    return this.contactService.submit(data);
  }
}
