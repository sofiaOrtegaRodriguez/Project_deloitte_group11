import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { hashPassword } from '../src/auth/password';
import { PrismaService } from '../src/prisma/prisma.service';
import { seedDirector } from '../src/users/director-seed';
import { createTestApp, DIRECTOR } from './app';
import { resetDatabase } from './helpers';

const NEW_USER = { name: 'Ana Silva', email: 'ana@hospital.test', password: 'long-enough-1' };

describe('Access Requests', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
  });
  beforeEach(async () => {
    await resetDatabase(prisma);
    await seedDirector(prisma);
  });
  afterAll(async () => {
    await app.close();
  });

  const register = (body: Record<string, unknown> = NEW_USER) => http().post('/api/auth/register').send(body);

  async function cookieFor(email: string, password: string): Promise<string> {
    const res = await http().post('/api/auth/login').send({ email, password }).expect(200);
    return (res.headers['set-cookie'] as unknown as string[])[0].split(';')[0];
  }
  const directorCookie = () => cookieFor(DIRECTOR.email, DIRECTOR.password);

  async function pendingId(email = NEW_USER.email): Promise<number> {
    return (await prisma.user.findFirstOrThrow({ where: { email, status: 'PENDING' } })).id;
  }

  describe('registering', () => {
    it('creates a Pending Procurement Team account with a hashed password, without logging in', async () => {
      const res = await register().expect(201);
      expect(res.headers['set-cookie']).toBeUndefined();
      const user = await prisma.user.findFirstOrThrow({ where: { email: NEW_USER.email } });
      expect(user).toMatchObject({ name: NEW_USER.name, role: 'PROCUREMENT_TEAM', status: 'PENDING' });
      expect(user.passwordHash).not.toContain(NEW_USER.password);
    });

    it('needs no login and lower-cases and trims the email', async () => {
      await register({ ...NEW_USER, email: '  Ana@Hospital.TEST ' }).expect(201);
      expect(await prisma.user.count({ where: { email: 'ana@hospital.test' } })).toBe(1);
    });

    it('rejects a password shorter than 8 characters', async () => {
      const res = await register({ ...NEW_USER, password: 'short' }).expect(400);
      expect(JSON.stringify(res.body)).toContain('at least 8');
      expect(await prisma.user.count()).toBe(1);
    });

    it('accepts a password of exactly 8 characters', async () => {
      await register({ ...NEW_USER, password: '12345678' }).expect(201);
    });

    it('rejects a missing name or an invalid email', async () => {
      await register({ ...NEW_USER, name: '' }).expect(400);
      await register({ ...NEW_USER, email: 'not-an-email' }).expect(400);
      expect(await prisma.user.count()).toBe(1);
    });

    it('does not let the request choose its own role or status', async () => {
      // The global ValidationPipe refuses unknown properties, so nothing is created.
      await register({ ...NEW_USER, role: 'DIRECTOR', status: 'ACTIVE' }).expect(400);
      expect(await prisma.user.count({ where: { email: NEW_USER.email } })).toBe(0);

      await register().expect(201);
      expect(await prisma.user.findFirstOrThrow({ where: { email: NEW_USER.email } })).toMatchObject({
        role: 'PROCUREMENT_TEAM',
        status: 'PENDING',
      });
    });

    it('refuses an email already used by a Pending, Active or Removed User (409)', async () => {
      await register().expect(201);
      await register({ ...NEW_USER, name: 'Other' }).expect(409);
      await register({ ...NEW_USER, email: DIRECTOR.email }).expect(409);
      await prisma.user.updateMany({ where: { email: NEW_USER.email }, data: { status: 'REMOVED' } });
      await register().expect(409);
      expect(await prisma.user.count()).toBe(2);
    });
  });

  describe('logging in with an Access Request', () => {
    it('Pending + correct password: pending message', async () => {
      await register().expect(201);
      const res = await http()
        .post('/api/auth/login')
        .send({ email: NEW_USER.email, password: NEW_USER.password })
        .expect(403);
      expect(res.body.message).toBe('Your access request is pending approval');
      expect(res.headers['set-cookie']).toBeUndefined();
    });

    it('Rejected + correct password: rejection message', async () => {
      await register().expect(201);
      await prisma.user.updateMany({ where: { email: NEW_USER.email }, data: { status: 'REJECTED' } });
      const res = await http()
        .post('/api/auth/login')
        .send({ email: NEW_USER.email, password: NEW_USER.password })
        .expect(403);
      expect(res.body.message).toBe('Your access request was rejected');
    });

    it('wrong password gives only the generic message, whatever the status', async () => {
      await register().expect(201);
      const pending = await http().post('/api/auth/login').send({ email: NEW_USER.email, password: 'wrong-password' }).expect(401);
      await prisma.user.updateMany({ where: { email: NEW_USER.email }, data: { status: 'REJECTED' } });
      const rejected = await http().post('/api/auth/login').send({ email: NEW_USER.email, password: 'wrong-password' }).expect(401);
      const unknown = await http().post('/api/auth/login').send({ email: 'nobody@hospital.test', password: 'wrong-password' }).expect(401);
      expect(pending.body.message).toBe('Invalid email or password');
      expect(rejected.body.message).toBe(pending.body.message);
      expect(unknown.body.message).toBe(pending.body.message);
    });

    it('Removed + correct password: removal message', async () => {
      await register().expect(201);
      await prisma.user.updateMany({ where: { email: NEW_USER.email }, data: { status: 'REMOVED' } });
      const res = await http()
        .post('/api/auth/login')
        .send({ email: NEW_USER.email, password: NEW_USER.password })
        .expect(403);
      expect(res.body.message).toBe('Your account has been removed');
    });

    it('a Rejected email can register again, and the new request is the one used to log in', async () => {
      await register().expect(201);
      await http().post(`/api/users/${await pendingId()}/reject`).set('Cookie', await directorCookie()).expect(200);

      await register({ ...NEW_USER, password: 'second-password' }).expect(201);
      expect(await prisma.user.count({ where: { email: NEW_USER.email } })).toBe(2);

      const res = await http()
        .post('/api/auth/login')
        .send({ email: NEW_USER.email, password: 'second-password' })
        .expect(403);
      expect(res.body.message).toBe('Your access request is pending approval');
    });
  });

  describe('Director decisions', () => {
    it('approve sets the account Active as Procurement Team, and the person can log in', async () => {
      await register().expect(201);
      const id = await pendingId();
      const res = await http().post(`/api/users/${id}/approve`).set('Cookie', await directorCookie()).expect(200);
      expect(res.body).toMatchObject({ id, status: 'ACTIVE', role: 'PROCUREMENT_TEAM' });
      expect(res.body.passwordHash).toBeUndefined();

      const login = await http().post('/api/auth/login').send({ email: NEW_USER.email, password: NEW_USER.password }).expect(200);
      expect(login.body.user).toMatchObject({ email: NEW_USER.email, role: 'PROCUREMENT_TEAM' });
    });

    it('reject sets the account Rejected and the person cannot log in', async () => {
      await register().expect(201);
      const id = await pendingId();
      const res = await http().post(`/api/users/${id}/reject`).set('Cookie', await directorCookie()).expect(200);
      expect(res.body).toMatchObject({ id, status: 'REJECTED' });
      await http().post('/api/auth/login').send({ email: NEW_USER.email, password: NEW_USER.password }).expect(403);
    });

    it('a request that was already decided cannot be decided again (409); an unknown id is 404', async () => {
      await register().expect(201);
      const id = await pendingId();
      const cookie = await directorCookie();
      await http().post(`/api/users/${id}/approve`).set('Cookie', cookie).expect(200);
      await http().post(`/api/users/${id}/reject`).set('Cookie', cookie).expect(409);
      expect(await prisma.user.findUniqueOrThrow({ where: { id } })).toMatchObject({ status: 'ACTIVE' });
      await http().post('/api/users/999999/approve').set('Cookie', cookie).expect(404);
    });

    it('cannot decide on the Director', async () => {
      const director = await prisma.user.findFirstOrThrow({ where: { role: 'DIRECTOR' } });
      await http().post(`/api/users/${director.id}/reject`).set('Cookie', await directorCookie()).expect(409);
      expect(await prisma.user.findUniqueOrThrow({ where: { id: director.id } })).toMatchObject({ status: 'ACTIVE' });
    });
  });

  describe('listing and the pending badge', () => {
    it('lists Users without password hashes, and filters by status', async () => {
      await register().expect(201);
      await register({ name: 'Bruno', email: 'bruno@hospital.test', password: 'password-bruno' }).expect(201);
      await http().post(`/api/users/${await pendingId('bruno@hospital.test')}/approve`).set('Cookie', await directorCookie());
      const cookie = await directorCookie();

      const all = await http().get('/api/users').set('Cookie', cookie).expect(200);
      expect(all.body).toHaveLength(3);
      expect(JSON.stringify(all.body)).not.toContain('passwordHash');

      const pending = await http().get('/api/users?status=PENDING').set('Cookie', cookie).expect(200);
      expect(pending.body.map((u: { email: string }) => u.email)).toEqual([NEW_USER.email]);
    });

    it('pending count follows registrations, approvals and rejections', async () => {
      const count = async () =>
        (await http().get('/api/users/pending-count').set('Cookie', await directorCookie()).expect(200)).body.count;
      expect(await count()).toBe(0);
      await register().expect(201);
      await register({ name: 'Bruno', email: 'bruno@hospital.test', password: 'password-bruno' }).expect(201);
      expect(await count()).toBe(2);
      await http().post(`/api/users/${await pendingId()}/approve`).set('Cookie', await directorCookie()).expect(200);
      expect(await count()).toBe(1);
      await http().post(`/api/users/${await pendingId('bruno@hospital.test')}/reject`).set('Cookie', await directorCookie()).expect(200);
      expect(await count()).toBe(0);
    });
  });

  describe('authorisation', () => {
    it('user management needs a login (401)', async () => {
      await http().get('/api/users').expect(401);
      await http().get('/api/users/pending-count').expect(401);
      await http().post('/api/users/1/approve').expect(401);
      await http().post('/api/users/1/reject').expect(401);
    });

    it('Procurement Team members get 403 on every user management endpoint', async () => {
      await prisma.user.create({
        data: {
          name: 'Team',
          email: 'team@hospital.test',
          passwordHash: await hashPassword('team-password'),
          role: 'PROCUREMENT_TEAM',
          status: 'ACTIVE',
        },
      });
      await register().expect(201);
      const id = await pendingId();
      const cookie = await cookieFor('team@hospital.test', 'team-password');
      await http().get('/api/users').set('Cookie', cookie).expect(403);
      await http().get('/api/users/pending-count').set('Cookie', cookie).expect(403);
      await http().post(`/api/users/${id}/approve`).set('Cookie', cookie).expect(403);
      await http().post(`/api/users/${id}/reject`).set('Cookie', cookie).expect(403);
      expect(await prisma.user.findUniqueOrThrow({ where: { id } })).toMatchObject({ status: 'PENDING' });
    });
  });

  it('produces no Notifications', async () => {
    const tables = await prisma.$queryRaw<{ tablename: string }[]>`
      SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename ILIKE '%notification%'`;
    await register().expect(201);
    await http().post(`/api/users/${await pendingId()}/approve`).set('Cookie', await directorCookie()).expect(200);
    for (const { tablename } of tables) {
      const [{ count }] = await prisma.$queryRawUnsafe<{ count: bigint }[]>(`SELECT count(*) FROM "${tablename}"`);
      expect(Number(count)).toBe(0);
    }
  });
});
