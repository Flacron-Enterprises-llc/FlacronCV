import type { FactoryProvider } from '@nestjs/common';
import { JOB_CAPACITY_LIMIT, type JobCapacityLimitResolver } from '../jobs/jobs.service';
import { UsersService } from './users.service';

/**
 * Wires the plan's tracked-application capacity into the jobs module's single
 * check point (`JOB_CAPACITY_LIMIT`, see jobs.service.ts). The limit is the
 * EFFECTIVE plan's `limits.trackedApplications` (Free 25, Starter 100,
 * Professional 500, Career Pro 2000, Business 500); legacy plans stay
 * unlimited (null), exactly as before the five-plan catalog.
 */
export const trackedApplicationCapacityProvider: FactoryProvider<JobCapacityLimitResolver> = {
  provide: JOB_CAPACITY_LIMIT,
  useFactory: (users: UsersService): JobCapacityLimitResolver => (userId) => users.trackedApplicationLimit(userId),
  inject: [UsersService],
};
