import { join } from 'path';
import { runtimePackages } from '@flacroncv/career-server/src/testing/runtime-dependencies';
import pkg from '../package.json';

/**
 * `dist/main.js` bundles the workspace packages and `require`s everything else
 * from this app's dependencies. The S3 SDK is loaded only when an S3 store is
 * built, which the worker never does, so it stays out of the worker.
 */
describe('worker runtime dependencies', () => {
  it('declares every package loaded at start-up and does not need the S3 SDK', () => {
    const root = join(__dirname, '..', '..', '..');
    const { eager, lazy } = runtimePackages([join(__dirname), join(root, 'packages/career-server/src'), join(root, 'packages/career-shared/src')], [
      // The migration runner is a separate entry, not bundled (packages/career-server/src/index.ts).
      join(root, 'packages/career-server/src/migrate.ts'),
      join(root, 'packages/career-server/src/database/migrations.ts'),
    ]);
    const declared = new Set(Object.keys(pkg.dependencies));
    expect([...eager].filter((name) => !declared.has(name)).sort()).toEqual([]);
    expect([...lazy].sort()).toEqual(['@aws-sdk/client-s3', '@aws-sdk/s3-request-presigner']);
    expect(declared.has('@aws-sdk/client-s3')).toBe(false);
  });
});
