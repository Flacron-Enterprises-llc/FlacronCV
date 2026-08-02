import { Module } from '@nestjs/common';
import { ContactController } from './contact.controller';
import { ContactService } from './contact.service';

// MailService is provided by the @Global MailModule, so it is injectable here.
@Module({
  controllers: [ContactController],
  providers: [ContactService],
})
export class ContactModule {}
