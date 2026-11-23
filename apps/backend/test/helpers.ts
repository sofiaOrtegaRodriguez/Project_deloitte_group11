import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { PrismaClient } from '../src/generated/prisma/client';

export const FIXTURES = path.join(__dirname, 'fixtures');
export const BASIC_FIXTURE = path.join(FIXTURES, 'basic');

/** Empties every table in the test database (except Prisma's migration history). */
export async function resetDatabase(prisma: PrismaClient): Promise<void> {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (tables.length === 0) return;
  const list = tables.map((t) => `"public"."${t.tablename}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE ${list} RESTART IDENTITY CASCADE`);
}

/** SHA-256 of every file in a folder, to prove the ETL leaves the originals untouched. */
export function hashFolder(dir: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const name of fs.readdirSync(dir).sort()) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isFile()) {
      result[name] = crypto.createHash('sha256').update(fs.readFileSync(full)).digest('hex');
    }
  }
  return result;
}

/** Copies a fixture folder to a temporary folder so a test can modify it. */
export function copyFixture(source: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hosstock-fixture-'));
  for (const name of fs.readdirSync(source)) fs.copyFileSync(path.join(source, name), path.join(dir, name));
  return dir;
}

export const isoDate = (date: Date): string => date.toISOString().slice(0, 10);
