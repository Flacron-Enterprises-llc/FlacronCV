import { randomBytes } from 'crypto';
import { Client, Pool } from 'pg';
import { isLocalDatabaseUrl } from '../database/database-url';
import { runMigrations } from '../database/migrations';

export interface TestDatabase {
  /** Throwaway schema that holds every table for this test file. */
  schema: string;
  /** Pool whose connections use that schema as `search_path`. */
  pool: Pool;
  /** Connection string with the same `search_path`, for a child process. */
  url: string;
  drop(): Promise<void>;
}

/**
 * Migrates a fresh schema in the local database from `.env` and returns a
 * pool bound to it. `public` is not touched. `drop()` removes the schema.
 * Refuses a non-local `DATABASE_URL`.
 */
export async function createTestDatabase(label: string): Promise<TestDatabase> {
  const baseUrl = process.env.DATABASE_URL?.trim() ?? '';
  if (baseUrl.length === 0) {
    throw new Error('Tests need DATABASE_URL in the repository-root .env (docs/LOCAL_SETUP.md)');
  }
  if (!isLocalDatabaseUrl(baseUrl)) {
    throw new Error('Tests refuse a DATABASE_URL that is not localhost or 127.0.0.1');
  }

  const safeLabel = label.toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 20);
  const schema = `test_${safeLabel}_${randomBytes(4).toString('hex')}`;

  try {
    await runMigrations({ databaseUrl: baseUrl, direction: 'up', schema, quiet: true, noLock: true });
  } catch (error) {
    await dropSchema(baseUrl, schema);
    throw error;
  }

  const url = withSearchPath(baseUrl, schema);
  const pool = new Pool({ connectionString: url, max: 10 });

  return {
    schema,
    pool,
    url,
    async drop() {
      await pool.end();
      await dropSchema(baseUrl, schema);
    },
  };
}

async function dropSchema(baseUrl: string, schema: string): Promise<void> {
  const client = new Client({ connectionString: baseUrl });
  await client.connect();
  try {
    await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  } finally {
    await client.end();
  }
}

function withSearchPath(databaseUrl: string, schema: string): string {
  const url = new URL(databaseUrl);
  url.searchParams.set('options', `-c search_path=${schema}`);
  return url.toString();
}
