// `npm run db:setup`: creates the Hosstock database if needed and applies all migrations.
// Safe to run again at any time: it never deletes data.
import { execSync } from 'node:child_process';
import * as path from 'node:path';
import { loadEnv, requireEnv } from '../src/config/env';
import { ensureDatabase } from '../src/database/ensure-database';

async function main(): Promise<void> {
  loadEnv();
  const url = requireEnv('DATABASE_URL');
  const created = await ensureDatabase(url);
  console.log(created ? 'Database created.' : 'Database already exists.');
  execSync('npx prisma migrate deploy', { stdio: 'inherit', cwd: path.resolve(__dirname, '..') });
  console.log('Database is ready. Next step: npm run etl');
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
