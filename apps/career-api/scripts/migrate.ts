import { Pool } from 'pg';
import { isLocalDatabaseUrl, loadRepoEnv, publishCatalog, redactDatabaseUrl } from '@flacroncv/career-server';
import { runMigrations } from '@flacroncv/career-server/src/migrate';

async function main(): Promise<number> {
  const direction = process.argv[2];
  if (direction !== 'up' && direction !== 'down') {
    console.error('Usage: migrate.ts up|down');
    return 1;
  }

  loadRepoEnv(__dirname);

  const databaseUrl = process.env.DATABASE_URL?.trim() ?? '';
  if (databaseUrl.length === 0) {
    console.error('Missing required environment variable: DATABASE_URL');
    return 1;
  }

  if (direction === 'down' && !isLocalDatabaseUrl(databaseUrl)) {
    console.error('migrate:down refused: DATABASE_URL host must be localhost or 127.0.0.1');
    return 1;
  }

  await runMigrations({ databaseUrl, direction });
  console.log('Migrations complete!');

  if (direction === 'up') {
    const pool = new Pool({ connectionString: databaseUrl, max: 1 });
    try {
      const result = await publishCatalog(pool);
      console.log(`Catalog seed: ${result}`);
    } finally {
      await pool.end();
    }
  }
  return 0;
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    const code = hasStringCode(error) ? error.code : 'ERR';
    const message = error instanceof Error ? error.message : 'Migration failed';
    console.error(`${code}: ${redactDatabaseUrl(message, process.env.DATABASE_URL)}`);
    process.exit(1);
  },
);

function hasStringCode(value: unknown): value is { code: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'code' in value &&
    typeof value.code === 'string' &&
    value.code.length > 0
  );
}
