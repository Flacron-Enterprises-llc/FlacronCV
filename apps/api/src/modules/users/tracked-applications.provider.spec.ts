import { ForbiddenException } from '@nestjs/common';
import { InMemoryFirestore } from '../firebase/in-memory-firestore';
import { UsersService } from './users.service';
import { trackedApplicationCapacityProvider } from './tracked-applications.provider';
import { JOB_CAPACITY_LIMIT, JobsService } from '../jobs/jobs.service';
import { SubscriptionPlan, SubscriptionStatus } from '@flacroncv/shared-types';

/** The plan's tracked-application capacity reaches the jobs module's single check point. */
describe('tracked-application capacity wiring', () => {
  it('provides JOB_CAPACITY_LIMIT from the effective plan', async () => {
    const firestore = new InMemoryFirestore();
    const users = new UsersService({ firestore } as any);
    await firestore.collection('users').doc('f').set({
      uid: 'f', subscription: { plan: SubscriptionPlan.FREE, status: SubscriptionStatus.ACTIVE }, usage: {},
    });
    await firestore.collection('users').doc('e').set({
      uid: 'e', subscription: { plan: SubscriptionPlan.ENTERPRISE, status: SubscriptionStatus.ACTIVE, currentPeriodEnd: null }, usage: {},
    });
    expect(trackedApplicationCapacityProvider.provide).toBe(JOB_CAPACITY_LIMIT);
    const resolve = (await trackedApplicationCapacityProvider.useFactory(users)) as (uid: string) => Promise<number | null>;
    expect(await resolve('f')).toBe(25);
    expect(await resolve('e')).toBeNull(); // legacy: unlimited, as before
    expect(await resolve('ghost')).toBeNull();
  });

  it('a Free user at 25 tracked applications cannot add another', async () => {
    const jobs = new JobsService({ firestore: new InMemoryFirestore() } as any, {} as any, {} as any);
    await expect(jobs.checkCapacity('u', 25)).resolves.toEqual({ used: 0, limit: 25 });
    for (let i = 0; i < 25; i++) {
      await (jobs as any).firebaseAdmin.firestore.collection('job_applications').doc('j' + i).set({
        id: 'j' + i, userId: 'u', deletedAt: null, archived: false, status: 'saved',
      });
    }
    await expect(jobs.checkCapacity('u', 25)).rejects.toBeInstanceOf(ForbiddenException);
  });
});
