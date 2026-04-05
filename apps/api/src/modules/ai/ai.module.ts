import { Module } from '@nestjs/common';
import { AIController } from './ai.controller';
import { AIService } from './ai.service';
import { OpenAIProvider } from './providers/openai.provider';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [UsersModule],
  controllers: [AIController],
  providers: [AIService, OpenAIProvider],
  exports: [AIService],
})
export class AIModule {}
