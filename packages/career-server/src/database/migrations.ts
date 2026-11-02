import { join, resolve } from 'path';
import { runner } from 'node-pg-migrate';
import { findRepoRoot } from '../env/load-env-file';

/**
 * `packages/career-server/migrations`. Found from the repository root so the path
 * is the same from source, from a test, and from a bundled `dist`.
 */
export function migrationsDir(): string {
  const root = findRepoRoot(__dirname);
  return root === null ? resolve(__dirname, '../../migrations') : join(root, 'packages', 'career-server', 'migrations');
}

export interface MigrationOptions {
  databaseUrl: string;
  direction: 'up' | 'down';
  /** Run inside this schema instead of `public`. Tests use a throwaway schema. */
  schema?: string;
  /** Number of migrations to apply. Defaults to all for up and one for down. */
  count?: number;
  quiet?: boolean;
  /**
   * Skip node-pg-migrate's database-wide advisory lock. Only for a schema
   * that no other process migrates, such as a test's throwaway schema.
   */
  noLock?: boolean;
  /** Print the SQL that would run, inside a transaction that is rolled back. Applies nothing. */
  dryRun?: boolean;
}

export async function runMigrations(options: MigrationOptions): Promise<void> {
  const silent = () => undefined;
  await runner({
    databaseUrl: options.databaseUrl,
    dir: migrationsDir(),
    direction: options.direction,
    migrationsTable: 'pgmigrations',
    count: options.count,
    checkOrder: true,
    noLock: options.noLock ?? false,
    dryRun: options.dryRun ?? false,
    ...(options.schema
      ? { schema: options.schema, migrationsSchema: options.schema, createSchema: true, createMigrationsSchema: true }
      : {}),
    ...(options.quiet ? { logger: { debug: silent, info: silent, warn: silent, error: silent } } : {}),
  });
}
