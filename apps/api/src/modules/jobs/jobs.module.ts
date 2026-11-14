import { Module } from '@nestjs/common';
import { JobsController } from './jobs.controller';
import { JobsService } from './jobs.service';
import { CVModule } from '../cv/cv.module';
import { CoverLetterModule } from '../cover-letter/cover-letter.module';
import { UsersModule } from '../users/users.module';
import { trackedApplicationCapacityProvider } from '../users/tracked-applications.provider';

/**
 * CV and cover-letter services are used to freeze the documents linked to an
 * application (spec: the version used stays attached after later edits).
 *
 * Plan capacity: `JOB_CAPACITY_LIMIT` (see jobs.service.ts) is provided by the
 * plan entitlements (users/tracked-applications.provider.ts).
 */
@Module({
  imports: [CVModule, CoverLetterModule, UsersModule],
  controllers: [JobsController],
  providers: [JobsService, trackedApplicationCapacityProvider],
})
export class JobsModule {}
