import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { seedDirector } from '../src/users/director-seed';
import { createTestApp, DIRECTOR } from './app';
import { resetDatabase } from './helpers';

const NEW_USER = { name: 'Ana Silva', email: 'ana@hospital.test', password: 'long-enough-1' };

describe('Remove, Restore, User Management Log and password change', () => {
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

  async function cookieFor(email: string, password: string): Promise<string> {
    const res = await http().post('/api/auth/login').send({ email, password }).expect(200);
    return (res.headers['set-cookie'] as unknown as string[])[0].split(';')[0];
  }
  const directorCookie = () => cookieFor(DIRECTOR.email, DIRECTOR.password);

  /** Registers and approves Ana; returns her id and a session cookie. */
  async function activeMember(): Promise<{ id: number; cookie: string; director: string }> {
    await http().post('/api/auth/register').send(NEW_USER).expect(201);
    const { id } = await prisma.user.findFirstOrThrow({ where: { email: NEW_USER.email } });
    const director = await directorCookie();
    await http().post(`/api/users/${id}/approve`).set('Cookie', director).expect(200);
    return { id, cookie: await cookieFor(NEW_USER.email, NEW_USER.password), director };
  }

  describe('Remove and Restore', () => {
    it('removing a member invalidates their session at once', async () => {
      const { id, cookie, director } = await activeMember();
      await http().get('/api/auth/me').set('Cookie', cookie).expect(200);

      const res = await http().post(`/api/users/${id}/remove`).set('Cookie', director).expect(200);
      expect(res.body.status).toBe('REMOVED');

      await http().get('/api/auth/me').set('Cookie', cookie).expect(401);
    });

    it('a Removed member with the correct password sees the removal message; a wrong password gets the generic one', async () => {
      const { id, director } = await activeMember();
      await http().post(`/api/users/${id}/remove`).set('Cookie', director).expect(200);

      const ok = await http().post('/api/auth/login').send({ email: NEW_USER.email, password: NEW_USER.password });
      expect(ok.status).toBe(403);
      expect(ok.body.message).toBe('Your account has been removed');
      const bad = await http().post('/api/auth/login').send({ email: NEW_USER.email, password: 'wrong-password' });
      expect(bad.status).toBe(401);
    });

    it('a Removed email cannot register again', async () => {
      const { id, director } = await activeMember();
      await http().post(`/api/users/${id}/remove`).set('Cookie', director).expect(200);
      await http().post('/api/auth/register').send(NEW_USER).expect(409);
    });

    it('restoring returns the member to Active and they can log in again', async () => {
      const { id, director } = await activeMember();
      await http().post(`/api/users/${id}/remove`).set('Cookie', director).expect(200);
      const res = await http().post(`/api/users/${id}/restore`).set('Cookie', director).expect(200);
      expect(res.body.status).toBe('ACTIVE');
      await cookieFor(NEW_USER.email, NEW_USER.password);
    });

    it('the Director cannot remove themselves, and stays Active', async () => {
      const director = await directorCookie();
      const me = await prisma.user.findFirstOrThrow({ where: { role: 'DIRECTOR' } });
      await http().post(`/api/users/${me.id}/remove`).set('Cookie', director).expect(403);
      await http().get('/api/auth/me').set('Cookie', director).expect(200);
      expect(await prisma.userManagementLogEntry.count()).toBe(0);
    });

    it('only an Active member can be removed and only a Removed one restored (409); unknown id is 404', async () => {
      const { id, director } = await activeMember();
      await http().post(`/api/users/${id}/restore`).set('Cookie', director).expect(409);
      await http().post(`/api/users/${id}/remove`).set('Cookie', director).expect(200);
      await http().post(`/api/users/${id}/remove`).set('Cookie', director).expect(409);
      await http().post('/api/users/9999/remove').set('Cookie', director).expect(404);
    });
  });

  describe('User Management Log', () => {
    it('records approve, reject, remove and restore with date, affected User and actor, newest first', async () => {
      const { id, director } = await activeMember();
      await http().post('/api/auth/register').send({ ...NEW_USER, name: 'Bob', email: 'bob@hospital.test' }).expect(201);
      const bob = await prisma.user.findFirstOrThrow({ where: { email: 'bob@hospital.test' } });
      await http().post(`/api/users/${bob.id}/reject`).set('Cookie', director).expect(200);
      await http().post(`/api/users/${id}/remove`).set('Cookie', director).expect(200);
      await http().post(`/api/users/${id}/restore`).set('Cookie', director).expect(200);

      const res = await http().get('/api/user-management-log').set('Cookie', director).expect(200);
      const entries = res.body as { date: string; action: string; affectedUser: { id: number; email: string }; actor: { name: string } | null }[];
      expect(entries.map((e) => e.action)).toEqual(['RESTORE', 'REMOVE', 'REJECT', 'APPROVE']);
      expect(entries[0].affectedUser).toMatchObject({ id, email: NEW_USER.email });
      expect(entries[2].affectedUser.email).toBe('bob@hospital.test');
      expect(entries.every((e) => e.actor?.name === DIRECTOR.name)).toBe(true);
      expect(new Date(entries[0].date).getTime()).not.toBeNaN();
    });

    it('a failed decision writes no entry, and an entry may have no actor', async () => {
      const { id, director } = await activeMember();
      await http().post(`/api/users/${id}/approve`).set('Cookie', director).expect(409);
      expect(await prisma.userManagementLogEntry.count()).toBe(1);

      await prisma.userManagementLogEntry.create({ data: { action: 'REMOVE', affectedUserId: id } });
      const res = await http().get('/api/user-management-log').set('Cookie', director).expect(200);
      expect(res.body[0].actor).toBeNull();
    });

    it('is Director only', async () => {
      const { id, cookie } = await activeMember();
      await http().get('/api/user-management-log').expect(401);
      await http().get('/api/user-management-log').set('Cookie', cookie).expect(403);
      await http().post(`/api/users/${id}/remove`).set('Cookie', cookie).expect(403);
      await http().post(`/api/users/${id}/restore`).set('Cookie', cookie).expect(403);
    });
  });

  describe('password change', () => {
    const change = (cookie: string, body: Record<string, unknown>) =>
      http().post('/api/auth/change-password').set('Cookie', cookie).send(body);

    it('rejects a wrong current password and changes nothing', async () => {
      const { cookie } = await activeMember();
      await change(cookie, { currentPassword: 'nope-nope', newPassword: 'brand-new-pass' }).expect(400);
      await cookieFor(NEW_USER.email, NEW_USER.password);
    });

    it('with the right current password, the new one logs in and the old one no longer does', async () => {
      const { cookie } = await activeMember();
      await change(cookie, { currentPassword: NEW_USER.password, newPassword: 'brand-new-pass' }).expect(204);
      await cookieFor(NEW_USER.email, 'brand-new-pass');
      await http().post('/api/auth/login').send({ email: NEW_USER.email, password: NEW_USER.password }).expect(401);
    });

    it('the Director can change theirs too; a short new password and no login are refused', async () => {
      const director = await directorCookie();
      await change(director, { currentPassword: DIRECTOR.password, newPassword: 'short' }).expect(400);
      await http().post('/api/auth/change-password').send({ currentPassword: 'x', newPassword: 'long-enough-1' }).expect(401);
      await change(director, { currentPassword: DIRECTOR.password, newPassword: 'new-director-pass' }).expect(204);
      await cookieFor(DIRECTOR.email, 'new-director-pass');
    });
  });
});
