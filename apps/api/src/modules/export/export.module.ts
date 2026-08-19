import { Module } from '@nestjs/common';
import { ExportController } from './export.controller';
import { ExportService } from './export.service';
import { CVModule } from '../cv/cv.module';
import { CoverLetterModule } from '../cover-letter/cover-letter.module';
import { UsersModule } from '../users/users.module';
import { AbuseModule } from '../abuse/abuse.module';

@Module({
  imports: [CVModule, CoverLetterModule, UsersModule, AbuseModule],
  controllers: [ExportController],
  providers: [ExportService],
  exports: [ExportService],
})
export class ExportModule {}
