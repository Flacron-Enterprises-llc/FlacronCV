import { assertDeploySafety, readDatabaseUrl } from '@flacroncv/career-server';

export interface WorkerConfig {
  databaseUrl: string;
  /** Schema pg-boss keeps its queue tables in. */
  bossSchema: string;
}

/** Same database and deployment rules as the API (`readDatabaseUrl`, `assertDeploySafety`). Never prints a value. */
export function readWorkerConfig(env: NodeJS.ProcessEnv = process.env): WorkerConfig {
  const databaseUrl = readDatabaseUrl(env);
  assertDeploySafety(env, 'worker');
  const bossSchema = env.PGBOSS_SCHEMA?.trim() || 'pgboss';
  if (!/^[a-z_][a-z0-9_]*$/.test(bossSchema)) {
    throw new Error('PGBOSS_SCHEMA must be a lowercase SQL identifier');
  }
  return { databaseUrl, bossSchema };
}
