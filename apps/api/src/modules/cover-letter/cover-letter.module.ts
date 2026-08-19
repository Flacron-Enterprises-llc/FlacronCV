import { Module } from '@nestjs/common';
import { CoverLetterController } from './cover-letter.controller';
import { CoverLetterService } from './cover-letter.service';
import { AIModule } from '../ai/ai.module';
import { CVModule } from '../cv/cv.module';
import { UsersModule } from '../users/users.module';
import { AbuseModule } from '../abuse/abuse.module';

@Module({
  imports: [AIModule, CVModule, UsersModule, AbuseModule],
  controllers: [CoverLetterController],
  providers: [CoverLetterService],
  exports: [CoverLetterService],
})
export class CoverLetterModule {}
