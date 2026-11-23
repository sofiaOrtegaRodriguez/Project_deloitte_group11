// Notifications inbox API. Uses the indicators fixture (see alerts.e2e-spec.ts): at the start Monitor is Critical
// and Syringe is Attention; urgency factor 1 with every ABC class escalates Syringe.
import type { INestApplication } from '@nestjs/common';
import * as path from 'node:path';
import request from 'supertest';
import { AlertsService } from '../src/alerts/alerts.module';
import { runEtl } from '../src/etl/run-etl';
import { PrismaService } from '../src/prisma/prisma.service';
import { runRecalculation } from '../src/recalculation/run-recalculation';
import { seedDirector } from '../src/users/director-seed';
import { createTestApp, DIRECTOR } from './app';
import { FIXTURES, resetDatabase } from './helpers';

interface NotificationBody {
  id: number;
  type: string;
  alertId: number | null;
  itemId: number | null;
  message: string;
  readAt: string | null;
}
interface ListBody {
  notifications: NotificationBody[];
  unreadCount: number;
}

describe('Notifications API', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let directorCookie: string;
  let anaCookie: string;
  const http = () => request(app.getHttpServer());

  async function login(email: string, password: string) {
    const res = await http().post('/api/auth/login').send({ email, password }).expect(200);
    return (res.headers['set-cookie'] as unknown as string[])[0].split(';')[0];
  }
  const inbox = async (cookie: string, query = '') =>
    (await http().get(`/api/notifications${query}`).set('Cookie', cookie).expect(200)).body as ListBody;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    await resetDatabase(prisma);
    await seedDirector(prisma);
    directorCookie = await login(DIRECTOR.email, DIRECTOR.password);
  });
  afterAll(async () => {
    await app.close();
  });

  it('requires login on every endpoint', async () => {
    await http().get('/api/notifications').expect(401);
    await http().post('/api/notifications/1/read').expect(401);
    await http().post('/api/notifications/read-all').expect(401);
  });

  it('produces no Notifications for registration or approval (Access Requests)', async () => {
    await http()
      .post('/api/auth/register')
      .send({ name: 'Nurse Ana', email: 'ana@hospital.test', password: 'ana-password' })
      .expect(201);
    await http()
      .post('/api/auth/register')
      .send({ name: 'Pending Bob', email: 'bob@hospital.test', password: 'bob-password' })
      .expect(201);
    const ana = await prisma.user.findFirstOrThrow({ where: { email: 'ana@hospital.test' } });
    await http().post(`/api/users/${ana.id}/approve`).set('Cookie', directorCookie).expect(200);
    anaCookie = await login('ana@hospital.test', 'ana-password');
    expect(await prisma.notification.count()).toBe(0);
    expect(await inbox(directorCookie)).toEqual({ notifications: [], unreadCount: 0 });
  });

  it('notifies every Active User when Alerts are created, and nobody else', async () => {
    await runEtl(prisma, path.join(FIXTURES, 'indicators')); // also runs the recalculation
    for (const cookie of [directorCookie, anaCookie]) {
      const body = await inbox(cookie);
      expect(body.unreadCount).toBe(2);
      expect(body.notifications.map((n) => n.type)).toEqual(['ALERT_CREATED', 'ALERT_CREATED']);
      expect(body.notifications.every((n) => n.alertId !== null && n.itemId !== null && n.readAt === null)).toBe(true);
      expect(body.notifications.map((n) => n.message).join('|')).toMatch(/Monitor/);
    }
    const bob = await prisma.user.findFirstOrThrow({ where: { email: 'bob@hospital.test' } });
    expect(await prisma.notification.count({ where: { userId: bob.id } })).toBe(0);
  });

  it('keeps read state per User and lists newest first', async () => {
    const mine = await inbox(directorCookie);
    const [newest, older] = mine.notifications;
    expect(newest.id).toBeGreaterThan(older.id);

    const read = await http().post(`/api/notifications/${newest.id}/read`).set('Cookie', directorCookie).expect(200);
    expect(read.body.readAt).not.toBeNull();
    expect((await inbox(directorCookie)).unreadCount).toBe(1);
    expect((await inbox(anaCookie)).unreadCount).toBe(2); // Ana's own copies stay unread

    const unread = await inbox(directorCookie, '?unread=true');
    expect(unread.notifications.map((n) => n.id)).toEqual([older.id]);
    expect(unread.unreadCount).toBe(1);
  });

  it('refuses to read someone else\'s Notification (404) and unknown ones', async () => {
    const anas = await inbox(anaCookie);
    await http().post(`/api/notifications/${anas.notifications[0].id}/read`).set('Cookie', directorCookie).expect(404);
    await http().post('/api/notifications/999999/read').set('Cookie', directorCookie).expect(404);
    expect((await inbox(anaCookie)).unreadCount).toBe(2);
  });

  it('notifies everyone on Escalation and on Reopening (with the reason)', async () => {
    await prisma.settings.upsert({
      where: { id: 1 },
      create: { id: 1, urgencyFactor: 1, criticalAbcClasses: ['A', 'B', 'C'] },
      update: { urgencyFactor: 1, criticalAbcClasses: ['A', 'B', 'C'] },
    });
    await runRecalculation(prisma);
    for (const cookie of [directorCookie, anaCookie]) {
      const escalated = (await inbox(cookie)).notifications.filter((n) => n.type === 'ALERT_ESCALATED');
      expect(escalated).toHaveLength(1);
      expect(escalated[0].message).toMatch(/Syringe/);
    }

    const monitor = await prisma.item.findFirstOrThrow({ where: { name: 'Monitor' } });
    const alert = await prisma.alert.findFirstOrThrow({ where: { itemId: monitor.id, status: { not: 'CLEARED' } } });
    await app.get(AlertsService).reopenAlert(alert.id, 'expected delivery overdue');
    for (const cookie of [directorCookie, anaCookie]) {
      const reopened = (await inbox(cookie)).notifications.filter((n) => n.type === 'ALERT_REOPENED');
      expect(reopened).toHaveLength(1);
      expect(reopened[0]).toMatchObject({ alertId: alert.id, itemId: monitor.id });
      expect(reopened[0].message).toContain('expected delivery overdue');
    }
  });

  it('does not notify again when nothing changed', async () => {
    const before = await prisma.notification.count();
    await runRecalculation(prisma);
    expect(await prisma.notification.count()).toBe(before);
  });

  it('marks all of the User\'s Notifications as read without touching others', async () => {
    const res = await http().post('/api/notifications/read-all').set('Cookie', anaCookie).expect(200);
    expect(res.body.updated).toBeGreaterThan(0);
    const ana = await inbox(anaCookie);
    expect(ana.unreadCount).toBe(0);
    expect(ana.notifications.every((n) => n.readAt !== null)).toBe(true);
    expect((await inbox(directorCookie)).unreadCount).toBeGreaterThan(0);
    expect((await inbox(anaCookie, '?unread=true')).notifications).toEqual([]);
  });
});
