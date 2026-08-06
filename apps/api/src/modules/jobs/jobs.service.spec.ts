import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { JobsService } from './jobs.service';
import { InMemoryFirestore } from '../firebase/in-memory-firestore';
import { JobStatus } from '@flacroncv/shared-types';

function makeService() {
  const firestore = new InMemoryFirestore();
  const service = new JobsService({ firestore } as any);
  return { service, firestore };
}

describe('JobsService', () => {
  it('creates a job scoped to the user, defaulting status to WISHLIST', async () => {
    const { service } = makeService();
    const job = await service.create('u1', { company: 'Acme', position: 'Engineer' });
    expect(job.userId).toBe('u1');
    expect(job.company).toBe('Acme');
    expect(job.status).toBe(JobStatus.WISHLIST);
    expect(job.deletedAt).toBeNull();
  });

  it('lists only the requesting user\'s non-deleted jobs', async () => {
    const { service } = makeService();
    await service.create('u1', { company: 'A', position: 'P1' });
    await service.create('u1', { company: 'B', position: 'P2' });
    await service.create('u2', { company: 'C', position: 'P3' });
    const list = await service.listByUser('u1');
    expect(list).toHaveLength(2);
    expect(list.every((j) => j.userId === 'u1')).toBe(true);
  });

  it('findByIdOrThrow enforces ownership (no IDOR) and 404s for missing', async () => {
    const { service } = makeService();
    const job = await service.create('u1', { company: 'A', position: 'P' });
    await expect(service.findByIdOrThrow(job.id, 'u2')).rejects.toThrow(ForbiddenException);
    await expect(service.findByIdOrThrow('ghost', 'u1')).rejects.toThrow(NotFoundException);
  });

  it('update applies whitelisted fields and drops userId/id mass-assignment', async () => {
    const { service } = makeService();
    const job = await service.create('u1', { company: 'A', position: 'P' });
    const updated = await service.update(job.id, 'u1', {
      status: JobStatus.APPLIED,
      company: 'A2',
      userId: 'attacker',
      id: 'evil',
    } as any);
    expect(updated.status).toBe(JobStatus.APPLIED);
    expect(updated.company).toBe('A2');
    expect(updated.userId).toBe('u1'); // ownership not reassigned
    expect(updated.id).toBe(job.id); // id not overwritten
  });

  it('update is blocked for another user', async () => {
    const { service } = makeService();
    const job = await service.create('u1', { company: 'A', position: 'P' });
    await expect(service.update(job.id, 'u2', { status: JobStatus.APPLIED })).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('soft-deletes (sets deletedAt and removes it from the list)', async () => {
    const { service } = makeService();
    const job = await service.create('u1', { company: 'A', position: 'P' });
    await service.delete(job.id, 'u1');
    expect(await service.listByUser('u1')).toHaveLength(0);
  });
});
