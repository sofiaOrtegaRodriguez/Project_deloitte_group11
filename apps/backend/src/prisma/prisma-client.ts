import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';
import { requireEnv } from '../config/env';

export { PrismaClient };

/** Creates a Prisma client for DATABASE_URL (or the given connection string). */
export function createPrismaClient(connectionString = requireEnv('DATABASE_URL')): PrismaClient {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}
