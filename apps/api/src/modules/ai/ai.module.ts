import { Module } from '@nestjs/common';
import { AIController } from './ai.controller';
import { AIService } from './ai.service';
import { OpenAIProvider } from './providers/openai.provider';
import { UsersModule } from '../users/users.module';
import { AbuseModule } from '../abuse/abuse.module';

@Module({
  imports: [UsersModule, AbuseModule],
  controllers: [AIController],
  providers: [AIService, OpenAIProvider],
  exports: [AIService],
})
export class AIModule {}
