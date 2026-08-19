import { Module } from '@nestjs/common';
import { CVController } from './cv.controller';
import { CVService } from './cv.service';
import { UsersModule } from '../users/users.module';
import { AIModule } from '../ai/ai.module';
import { AbuseModule } from '../abuse/abuse.module';

@Module({
  imports: [UsersModule, AIModule, AbuseModule],
  controllers: [CVController],
  providers: [CVService],
  exports: [CVService],
})
export class CVModule {}
