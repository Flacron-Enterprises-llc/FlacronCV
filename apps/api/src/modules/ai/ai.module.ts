import { Module } from '@nestjs/common';
import { AIController } from './ai.controller';
import { AIService } from './ai.service';
import { AnthropicProvider } from './providers/anthropic.provider';
import { OpenAIProvider } from './providers/openai.provider';
import { WatsonXProvider } from './providers/watsonx.provider';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [UsersModule],
  controllers: [AIController],
  providers: [AIService, AnthropicProvider, OpenAIProvider, WatsonXProvider],
  exports: [AIService],
})
export class AIModule {}
