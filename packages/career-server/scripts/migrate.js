const { runner } = require('node-pg-migrate');
const path = require('path');

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is required. See docs/LOCAL_SETUP.md.');
    process.exit(1);
  }
  console.log('Running migrations on:', url.replace(/:[^:@]+@/, ':****@'));
  await runner({
    databaseUrl: url,
    dir: path.resolve(__dirname, '../migrations'),
    direction: 'up',
    migrationsTable: 'pgmigrations',
    checkOrder: true,
  });
  console.log('MIGRATED_OK');
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
