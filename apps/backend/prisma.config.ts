import { defineConfig } from 'prisma/config';
import { loadEnv } from './src/config/env';

loadEnv();

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  // `prisma generate` doesn't need a database, so DATABASE_URL may be missing on a fresh clone.
  ...(process.env.DATABASE_URL ? { datasource: { url: process.env.DATABASE_URL } } : {}),
});
