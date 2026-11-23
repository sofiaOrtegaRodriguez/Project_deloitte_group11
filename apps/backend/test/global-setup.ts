// Runs once before the API tests: creates the test database if needed and applies all migrations.
import { execSync } from 'node:child_process';
import * as path from 'node:path';
import { loadEnv } from '../src/config/env';
import { ensureDatabase } from '../src/database/ensure-database';

export default async function globalSetup(): Promise<void> {
  loadEnv();
  const testUrl = process.env.TEST_DATABASE_URL;
  if (!testUrl) {
    throw new Error('TEST_DATABASE_URL is not set. Add it to the .env file at the project root (see .env.example).');
  }
  if (testUrl === process.env.DATABASE_URL) {
    throw new Error('TEST_DATABASE_URL must point to a different database than DATABASE_URL: tests wipe it.');
  }
  await ensureDatabase(testUrl);
  // Brings the schema up to date. Each test file empties the tables it uses (see resetDatabase in helpers.ts).
  execSync('npx prisma migrate deploy', {
    cwd: path.resolve(__dirname, '..'),
    env: { ...process.env, DATABASE_URL: testUrl },
    stdio: 'pipe',
  });
}
