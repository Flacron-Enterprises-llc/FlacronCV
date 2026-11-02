import { readdirSync, writeFileSync } from 'fs';
import { Client } from 'pg';
import { loadRepoEnv, redactDatabaseUrl } from '@flacroncv/career-server';
import { migrationsDir } from '@flacroncv/career-server/src/database/migrations';

/**
 * Read-only migration report for a planned career-database migration.
 *
 *   pnpm --filter career-api migrate:status [--snapshot <file.json>]
 *
 * Prints applied and pending migrations and, with --snapshot, writes the row
 * count of every table so a before/after (or primary/restore) pair can be
 * reconciled. Runs no DDL and no writes; the transaction is READ ONLY.
 */
async function main(): Promise<number> {
  loadRepoEnv(__dirname);
  const databaseUrl = process.env.DATABASE_URL?.trim() ?? '';
  if (!databaseUrl) {
    console.error('Missing required environment variable: DATABASE_URL');
    return 1;
  }
  const snapshotIndex = process.argv.indexOf('--snapshot');
  const snapshotFile = snapshotIndex > -1 ? process.argv[snapshotIndex + 1] : null;

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query('BEGIN READ ONLY');
    const files = readdirSync(migrationsDir())
      .filter((name) => name.endsWith('.js'))
      .map((name) => name.replace(/\.js$/, ''))
      .sort();
    const table = await client.query<{ exists: boolean }>(`SELECT to_regclass('pgmigrations') IS NOT NULL AS exists`);
    const applied = table.rows[0].exists
      ? (await client.query<{ name: string }>('SELECT name FROM pgmigrations ORDER BY run_on, id')).rows.map((row) => row.name)
      : [];
    const pending = files.filter((name) => !applied.includes(name));
    const unknown = applied.filter((name) => !files.includes(name));
    console.log(`Database: ${redactDatabaseUrl(databaseUrl, databaseUrl)}`);
    console.log(`Applied: ${applied.length}  Pending: ${pending.length}  Unknown (applied but no file): ${unknown.length}`);
    for (const name of pending) console.log(`  pending  ${name}`);
    for (const name of unknown) console.log(`  UNKNOWN  ${name}`);

    if (snapshotFile) {
      const tables = await client.query<{ name: string }>(
        `SELECT tablename AS name FROM pg_tables WHERE schemaname = current_schema() ORDER BY tablename`,
      );
      const counts: Record<string, number> = {};
      for (const { name } of tables.rows) {
        const res = await client.query<{ n: number }>(`SELECT count(*)::int AS n FROM "${name.replace(/"/g, '""')}"`);
        counts[name] = res.rows[0].n;
      }
      writeFileSync(snapshotFile, JSON.stringify({ takenAt: new Date().toISOString(), applied: applied.length, pending, counts }, null, 2));
      console.log(`Row counts for ${tables.rows.length} tables written to ${snapshotFile}`);
    }
    await client.query('ROLLBACK');
    return unknown.length > 0 ? 2 : 0;
  } finally {
    await client.end();
  }
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    console.error(redactDatabaseUrl(error instanceof Error ? error.message : 'Status check failed', process.env.DATABASE_URL));
    process.exit(1);
  },
);
