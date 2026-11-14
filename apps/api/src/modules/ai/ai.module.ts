import { Module } from '@nestjs/common';
import { AIController } from './ai.controller';
import { AIService } from './ai.service';
import { OpenAIProvider } from './providers/openai.provider';
import { UsersModule } from '../users/users.module';
import { AbuseModule } from '../abuse/abuse.module';
import { CareerMeteringModule } from '../career-metering/career-metering.module';

@Module({
  // CareerMeteringModule: the UsageMeter (career ledger when CAREER_API_URL is set, V1 counters otherwise).
  imports: [UsersModule, AbuseModule, CareerMeteringModule],
  controllers: [AIController],
  providers: [AIService, OpenAIProvider],
  exports: [AIService],
})
export class AIModule {}
