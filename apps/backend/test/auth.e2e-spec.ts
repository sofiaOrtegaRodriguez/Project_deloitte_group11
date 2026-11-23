import { Controller, Get, type INestApplication } from '@nestjs/common';
import request from 'supertest';
import { Roles } from '../src/auth/decorators';
import { hashPassword } from '../src/auth/password';
import type { AccountStatus } from '../src/generated/prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';
import { seedDirector } from '../src/users/director-seed';
import { createTestApp, DIRECTOR } from './app';
import { resetDatabase } from './helpers';

/** Test-only endpoint to exercise the role check of the global guard. */
@Controller('test/director-only')
class DirectorOnlyController {
  @Get()
  @Roles('DIRECTOR')
  ok() {
    return { ok: true };
  }
}

const TEAM_PASSWORD = 'team-password';

describe('Authentication', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp([DirectorOnlyController]));
  });
  beforeEach(async () => {
    await resetDatabase(prisma);
    await seedDirector(prisma);
  });
  afterAll(async () => {
    await app.close();
  });

  async function createTeamMember(status: AccountStatus, email = 'team@hospital.test') {
    return prisma.user.create({
      data: { name: 'Team Member', email, passwordHash: await hashPassword(TEAM_PASSWORD), role: 'PROCUREMENT_TEAM', status },
    });
  }

  /** Logs in and returns the session cookie. */
  async function login(email: string, password: string): Promise<string> {
    const res = await http().post('/api/auth/login').send({ email, password }).expect(200);
    return (res.headers['set-cookie'] as unknown as string[])[0].split(';')[0];
  }

  describe('Director seeding', () => {
    it('creates the Director from the environment, Active, with a hashed password', async () => {
      const users = await prisma.user.findMany();
      expect(users).toHaveLength(1);
      expect(users[0]).toMatchObject({ name: DIRECTOR.name, email: DIRECTOR.email, role: 'DIRECTOR', status: 'ACTIVE' });
      expect(users[0].passwordHash).not.toContain(DIRECTOR.password);
    });

    it('is idempotent and never overwrites the existing Director', async () => {
      const before = await prisma.user.findFirstOrThrow();
      process.env.DIRECTOR_PASSWORD = 'a-different-password';
      try {
        expect(await seedDirector(prisma)).toBe('exists');
      } finally {
        process.env.DIRECTOR_PASSWORD = DIRECTOR.password;
      }
      expect(await prisma.user.findMany()).toEqual([before]);
    });

    it('runs when the app starts', async () => {
      await resetDatabase(prisma);
      const { app: fresh, prisma: freshPrisma } = await createTestApp();
      try {
        expect(await freshPrisma.user.count({ where: { role: 'DIRECTOR' } })).toBe(1);
      } finally {
        await fresh.close();
      }
    });
  });

  describe('POST /api/auth/login', () => {
    it('logs the Director in and sets an httpOnly session cookie', async () => {
      const res = await http()
        .post('/api/auth/login')
        .send({ email: DIRECTOR.email, password: DIRECTOR.password })
        .expect(200);

      expect(res.body).toEqual({ user: { id: expect.any(Number), name: DIRECTOR.name, email: DIRECTOR.email, role: 'DIRECTOR' } });
      const cookie = (res.headers['set-cookie'] as unknown as string[])[0];
      expect(cookie).toMatch(/^hosstock_session=[^;]+;/);
      expect(cookie).toMatch(/HttpOnly/i);
      expect(cookie).toMatch(/SameSite=Lax/i);
    });

    it('accepts the email in any letter case', async () => {
      await http().post('/api/auth/login').send({ email: 'DIRECTOR@hospital.TEST', password: DIRECTOR.password }).expect(200);
    });

    it('gives the same generic message for a wrong password and for an unknown email', async () => {
      const wrongPassword = await http().post('/api/auth/login').send({ email: DIRECTOR.email, password: 'nope-nope' }).expect(401);
      const unknownEmail = await http().post('/api/auth/login').send({ email: 'nobody@hospital.test', password: 'whatever1' }).expect(401);

      expect(wrongPassword.body.message).toBe('Invalid email or password');
      expect(unknownEmail.body).toEqual(wrongPassword.body);
      expect(wrongPassword.headers['set-cookie']).toBeUndefined();
    });

    it.each([
      ['PENDING', 'Your access request is pending approval'],
      ['REJECTED', 'Your access request was rejected'],
      ['REMOVED', 'Your account has been removed'],
    ] as const)('explains a %s Account Status only after a correct password', async (status, message) => {
      await createTeamMember(status);

      const correct = await http().post('/api/auth/login').send({ email: 'team@hospital.test', password: TEAM_PASSWORD }).expect(403);
      expect(correct.body.message).toBe(message);
      expect(correct.headers['set-cookie']).toBeUndefined();

      const wrong = await http().post('/api/auth/login').send({ email: 'team@hospital.test', password: 'wrong-password' }).expect(401);
      expect(wrong.body.message).toBe('Invalid email or password');
    });

    it('rejects a malformed request', async () => {
      await http().post('/api/auth/login').send({ email: 'not-an-email', password: 'x' }).expect(400);
      await http().post('/api/auth/login').send({}).expect(400);
    });
  });

  describe('session guard', () => {
    it('rejects requests without a session', async () => {
      await http().get('/api/auth/me').expect(401);
    });

    it('rejects a tampered or foreign token', async () => {
      const cookie = await login(DIRECTOR.email, DIRECTOR.password);
      await http().get('/api/auth/me').set('Cookie', `${cookie}x`).expect(401);
      await http().get('/api/auth/me').set('Cookie', 'hosstock_session=not-a-jwt').expect(401);
    });

    it('returns the logged-in User', async () => {
      const cookie = await login(DIRECTOR.email, DIRECTOR.password);
      const res = await http().get('/api/auth/me').set('Cookie', cookie).expect(200);
      expect(res.body.user).toMatchObject({ email: DIRECTOR.email, role: 'DIRECTOR' });
      expect(res.body.user.passwordHash).toBeUndefined();
    });

    it('checks the Account Status on every request, so a valid token stops working at once', async () => {
      const member = await createTeamMember('ACTIVE');
      const cookie = await login('team@hospital.test', TEAM_PASSWORD);
      await http().get('/api/auth/me').set('Cookie', cookie).expect(200);

      await prisma.user.update({ where: { id: member.id }, data: { status: 'REMOVED' } });

      await http().get('/api/auth/me').set('Cookie', cookie).expect(401);
    });

    it('checks the role from the database: 403 for the Procurement Team on Director-only endpoints', async () => {
      await createTeamMember('ACTIVE');
      const teamCookie = await login('team@hospital.test', TEAM_PASSWORD);
      const directorCookie = await login(DIRECTOR.email, DIRECTOR.password);

      await http().get('/api/test/director-only').set('Cookie', teamCookie).expect(403);
      await http().get('/api/test/director-only').set('Cookie', directorCookie).expect(200, { ok: true });
    });
  });

  describe('POST /api/auth/logout', () => {
    it('clears the session cookie', async () => {
      const res = await http().post('/api/auth/logout').expect(204);
      expect((res.headers['set-cookie'] as unknown as string[])[0]).toMatch(/^hosstock_session=;.*Expires=Thu, 01 Jan 1970/);
    });
  });
});
