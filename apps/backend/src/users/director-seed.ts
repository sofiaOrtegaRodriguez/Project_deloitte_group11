import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import type { PrismaClient } from '../generated/prisma/client';
import { requireEnv } from '../config/env';
import { normaliseEmail } from '../auth/auth-user';
import { hashPassword } from '../auth/password';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Creates the Director from DIRECTOR_NAME / DIRECTOR_EMAIL / DIRECTOR_PASSWORD if there is no Director yet.
 * Runs on every start but does nothing once a Director exists, whatever its email: later changes to the
 * DIRECTOR_* variables in .env are not applied to the existing Director.
 */
export async function seedDirector(prisma: PrismaClient): Promise<'created' | 'exists'> {
  if (await prisma.user.findFirst({ where: { role: 'DIRECTOR' } })) return 'exists';

  const password = requireEnv('DIRECTOR_PASSWORD');
  if (password.length < 8) throw new Error('DIRECTOR_PASSWORD must be at least 8 characters long.');

  await prisma.user.create({
    data: {
      name: requireEnv('DIRECTOR_NAME').trim(),
      email: normaliseEmail(requireEnv('DIRECTOR_EMAIL')),
      passwordHash: await hashPassword(password),
      role: 'DIRECTOR',
      status: 'ACTIVE',
    },
  });
  return 'created';
}

@Injectable()
export class DirectorSeed implements OnApplicationBootstrap {
  private readonly logger = new Logger('DirectorSeed');

  constructor(private readonly prisma: PrismaService) {}

  async onApplicationBootstrap(): Promise<void> {
    if ((await seedDirector(this.prisma)) === 'created') {
      this.logger.log(`Director created for ${normaliseEmail(requireEnv('DIRECTOR_EMAIL'))}`);
    }
  }
}
