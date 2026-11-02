import type { Provider } from '@nestjs/common';
import { createObjectStorage } from '@flacroncv/career-server';
import type { ObjectStorage } from '@flacroncv/career-server';
import { StorageCleanupScheduler } from './storage-cleanup.scheduler';
import { OBJECT_STORAGE } from './storage.token';

export { OBJECT_STORAGE };

export const storageProviders: Provider[] = [
  { provide: OBJECT_STORAGE, useFactory: (): ObjectStorage => createObjectStorage(process.env) },
  StorageCleanupScheduler,
];
