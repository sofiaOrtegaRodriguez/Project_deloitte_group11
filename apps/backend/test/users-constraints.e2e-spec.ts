// Database rules for Users, enforced by PostgreSQL itself so no code path can break them.
import type { AccountStatus, Role } from '../src/generated/prisma/client';
import { createPrismaClient, PrismaClient } from '../src/prisma/prisma-client';
import { resetDatabase } from './helpers';

describe('User constraints in the database', () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    prisma = createPrismaClient();
  });
  beforeEach(async () => {
    await resetDatabase(prisma);
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  let n = 0;
  const createUser = (email: string, status: AccountStatus, role: Role = 'PROCUREMENT_TEAM') =>
    prisma.user.create({ data: { name: `User ${++n}`, email, passwordHash: 'x', role, status } });

  const UNIQUE_VIOLATION = { code: 'P2002' };

  it('allows only one Director', async () => {
    await createUser('director@hospital.test', 'ACTIVE', 'DIRECTOR');
    await expect(createUser('other@hospital.test', 'ACTIVE', 'DIRECTOR')).rejects.toMatchObject(UNIQUE_VIOLATION);
    expect(await prisma.user.count({ where: { role: 'DIRECTOR' } })).toBe(1);
  });

  it.each([
    ['PENDING', 'ACTIVE'],
    ['ACTIVE', 'PENDING'],
    ['REMOVED', 'PENDING'],
    ['ACTIVE', 'ACTIVE'],
  ] as const)('rejects a second %s/%s User with the same email', async (first, second) => {
    await createUser('same@hospital.test', first);
    await expect(createUser('same@hospital.test', second)).rejects.toMatchObject(UNIQUE_VIOLATION);
  });

  it('lets a Rejected User’s email be used again, any number of times', async () => {
    await createUser('again@hospital.test', 'REJECTED');
    await createUser('again@hospital.test', 'REJECTED');
    await createUser('again@hospital.test', 'PENDING');
    expect(await prisma.user.count({ where: { email: 'again@hospital.test' } })).toBe(3);
  });

  it('keeps the rule when a Rejected User would become non-Rejected next to another one', async () => {
    const rejected = await createUser('flip@hospital.test', 'REJECTED');
    await createUser('flip@hospital.test', 'PENDING');
    await expect(prisma.user.update({ where: { id: rejected.id }, data: { status: 'ACTIVE' } })).rejects.toMatchObject(
      UNIQUE_VIOLATION,
    );
  });
});
