import { join } from 'path';
import { runtimePackages } from '@flacroncv/career-server/src/testing/runtime-dependencies';
import pkg from '../package.json';

/** `dist/main.js` bundles the workspace packages and `require`s everything else from this app's dependencies. */
describe('API runtime dependencies', () => {
  it('declares every package its bundle loads, including the ones loaded on first use', () => {
    const root = join(__dirname, '..', '..', '..');
    const { eager, lazy } = runtimePackages([join(__dirname), join(root, 'packages/career-server/src'), join(root, 'packages/career-shared/src')], [
      // The migration runner is a separate entry, not bundled (packages/career-server/src/index.ts).
      join(root, 'packages/career-server/src/migrate.ts'),
      join(root, 'packages/career-server/src/database/migrations.ts'),
    ]);
    const declared = new Set(Object.keys(pkg.dependencies));
    expect([...eager, ...lazy].filter((name) => !declared.has(name)).sort()).toEqual([]);
  });
});
