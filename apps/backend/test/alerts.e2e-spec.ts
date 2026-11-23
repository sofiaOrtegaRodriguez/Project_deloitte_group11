// Alert lifecycle API, with the indicators fixture (see items.e2e-spec.ts for its hand-computed values).
// At the default Reference Date (2025-01-10): Monitor is Critical (below minimum), Syringe is Attention,
// the others are Normal. Settings change the picture between recalculations:
//   - urgency factor 1 and ABC Class C counting towards Critical: Syringe (autonomy 6 <= 1 x 6) becomes Critical.
//   - Reference Date 2025-01-05: Syringe is Normal.
import type { INestApplication } from '@nestjs/common';
import * as path from 'node:path';
import request from 'supertest';
import { runEtl } from '../src/etl/run-etl';
import { PrismaService } from '../src/prisma/prisma.service';
import { runRecalculation } from '../src/recalculation/run-recalculation';
import { AlertsService } from '../src/alerts/alerts.module';
import { seedDirector } from '../src/users/director-seed';
import { createTestApp, DIRECTOR } from './app';
import { FIXTURES, resetDatabase } from './helpers';

interface EventBody {
  type: string;
  fromStatus: string | null;
  toStatus: string | null;
  fromLevel: string | null;
  toLevel: string | null;
  user: { id: number; name: string } | null;
  comment: string | null;
  note: string | null;
}
interface AlertBody {
  id: number;
  itemId: number;
  itemName: string;
  level: string;
  status: string;
  priorityScore: number | null;
  reminderCount: number;
  reason: string | null;
  events: EventBody[];
}

describe('Alerts API', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let cookie: string;
  let memberCookie: string;
  const http = () => request(app.getHttpServer());

  async function login(email: string, password: string) {
    const res = await http().post('/api/auth/login').send({ email, password }).expect(200);
    return (res.headers['set-cookie'] as unknown as string[])[0].split(';')[0];
  }
  const recalc = () => runRecalculation(prisma);
  const list = async (query = '') =>
    (await http().get(`/api/alerts${query}`).set('Cookie', cookie).expect(200)).body as AlertBody[];
  const byItem = (alerts: AlertBody[], name: string) => alerts.filter((a) => a.itemName === name);
  const get = async (id: number) => (await http().get(`/api/alerts/${id}`).set('Cookie', cookie).expect(200)).body as AlertBody;
  const setStatus = (id: number, status: string, ck = cookie) =>
    http().post(`/api/alerts/${id}/status`).set('Cookie', ck).send({ status });

  async function resetSettings() {
    await prisma.settings.deleteMany();
  }

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    await resetDatabase(prisma);
    await seedDirector(prisma);
    await runEtl(prisma, path.join(FIXTURES, 'indicators')); // also runs the recalculation
    cookie = await login(DIRECTOR.email, DIRECTOR.password);
    await http()
      .post('/api/auth/register')
      .send({ name: 'Nurse Ana', email: 'ana@hospital.test', password: 'ana-password' })
      .expect(201);
    const pending = await prisma.user.findFirstOrThrow({ where: { email: 'ana@hospital.test' } });
    await http().post(`/api/users/${pending.id}/approve`).set('Cookie', cookie).expect(200);
    memberCookie = await login('ana@hospital.test', 'ana-password');
  });
  afterAll(async () => {
    await app.close();
  });

  it('requires login on every endpoint', async () => {
    await http().get('/api/alerts').expect(401);
    await http().get('/api/alerts/1').expect(401);
    await http().get('/api/items/1/alerts').expect(401);
    await http().post('/api/alerts/1/status').send({ status: 'VIEWED' }).expect(401);
    await http().post('/api/alerts/1/comments').send({ comment: 'hi' }).expect(401);
  });

  it('creates an Alert for each Critical or Attention Item, ordered by Urgency Level, logged as system', async () => {
    const alerts = await list();
    expect(alerts.map((a) => [a.itemName, a.level, a.status])).toEqual([
      ['Monitor', 'CRITICAL', 'NEW'],
      ['Syringe', 'ATTENTION', 'NEW'],
    ]);
    expect(alerts[1].priorityScore).toBe(200);
    expect(alerts[0].reminderCount).toBe(0);
    const detail = await get(alerts[0].id);
    expect(detail.events).toHaveLength(1);
    expect(detail.events[0]).toMatchObject({ type: 'CREATED', toStatus: 'NEW', toLevel: 'CRITICAL', user: null });
  });

  it('keeps one open Alert per Item when recalculated again', async () => {
    const before = await list();
    await recalc();
    await recalc();
    const after = await list();
    expect(after.map((a) => a.id)).toEqual(before.map((a) => a.id));
    expect(await prisma.alertEvent.count({ where: { type: 'CREATED' } })).toBe(2);
  });

  it('lets a User change the status by hand, logs the user, and shares it with the team', async () => {
    const [monitor] = byItem(await list(), 'Monitor');
    for (const status of ['VIEWED', 'ACKNOWLEDGED', 'IGNORED', 'RESOLVED']) {
      const res = await setStatus(monitor.id, status).expect(200);
      expect(res.body.status).toBe(status);
    }
    // Another User sees the same status.
    const seen = (await http().get(`/api/alerts/${monitor.id}`).set('Cookie', memberCookie).expect(200)).body as AlertBody;
    expect(seen.status).toBe('RESOLVED');
    const transitions = seen.events.filter((e) => e.type === 'STATUS_CHANGED');
    expect(transitions.map((e) => [e.fromStatus, e.toStatus])).toEqual([
      ['NEW', 'VIEWED'],
      ['VIEWED', 'ACKNOWLEDGED'],
      ['ACKNOWLEDGED', 'IGNORED'],
      ['IGNORED', 'RESOLVED'],
    ]);
    expect(transitions.every((e) => e.user?.name === DIRECTOR.name)).toBe(true);

    // The team member can act too, and is the author.
    await setStatus(monitor.id, 'VIEWED', memberCookie).expect(200);
    const last = (await get(monitor.id)).events.at(-1)!;
    expect(last.user?.name).toBe('Nurse Ana');
  });

  it('rejects statuses a person cannot choose and unknown Alerts', async () => {
    const [monitor] = byItem(await list(), 'Monitor');
    await setStatus(monitor.id, 'NEW').expect(400);
    await setStatus(monitor.id, 'CLEARED').expect(400);
    await setStatus(99999, 'VIEWED').expect(404);
    await http().get('/api/alerts/99999').set('Cookie', cookie).expect(404);
  });

  it('records comments in any status with their author and date', async () => {
    const [syringe] = byItem(await list(), 'Syringe');
    await setStatus(syringe.id, 'IGNORED').expect(200);
    const res = await http()
      .post(`/api/alerts/${syringe.id}/comments`)
      .set('Cookie', memberCookie)
      .send({ comment: '  Called the vendor  ' })
      .expect(201);
    const comment = res.body.events.at(-1) as EventBody;
    expect(comment).toMatchObject({ type: 'COMMENTED', comment: 'Called the vendor', user: { name: 'Nurse Ana' } });
    expect(res.body.status).toBe('IGNORED'); // a comment does not change the status
    await http().post(`/api/alerts/${syringe.id}/comments`).set('Cookie', cookie).send({ comment: '   ' }).expect(400);
    await http().post('/api/alerts/99999/comments').set('Cookie', cookie).send({ comment: 'x' }).expect(404);
  });

  it('creates no new Alert while the Item still has an open one, whatever its status', async () => {
    // Syringe is Ignored, Monitor is Viewed; both Items are still in trouble.
    await recalc();
    const alerts = await list();
    expect(alerts).toHaveLength(2);
    expect(byItem(alerts, 'Syringe')[0].status).toBe('IGNORED');
    expect(byItem(alerts, 'Monitor')[0].status).toBe('VIEWED');
  });

  it('Escalation raises the level and returns the Alert to New', async () => {
    await prisma.settings.upsert({
      where: { id: 1 },
      create: { id: 1, urgencyFactor: 1, criticalAbcClasses: ['A', 'B', 'C'] },
      update: { urgencyFactor: 1, criticalAbcClasses: ['A', 'B', 'C'] },
    });
    await recalc();
    const alerts = await list();
    const syringe = byItem(alerts, 'Syringe');
    expect(syringe).toHaveLength(1);
    expect(syringe[0]).toMatchObject({ level: 'CRITICAL', status: 'NEW' });
    const detail = await get(syringe[0].id);
    expect(detail.events.at(-1)).toMatchObject({
      type: 'ESCALATED',
      fromStatus: 'IGNORED',
      toStatus: 'NEW',
      fromLevel: 'ATTENTION',
      toLevel: 'CRITICAL',
      user: null,
    });
    expect(detail.events.some((e) => e.type === 'COMMENTED')).toBe(true); // the history stays in one place
    // Critical Items first, then by Priority Score.
    expect(alerts.every((a) => a.level === 'CRITICAL')).toBe(true);
    await resetSettings();
  });

  it('Clears the Alert when the Item returns to Normal, then creates a fresh one only after that', async () => {
    const [syringe] = byItem(await list(), 'Syringe');
    await setStatus(syringe.id, 'ACKNOWLEDGED').expect(200);

    await prisma.settings.upsert({
      where: { id: 1 },
      create: { id: 1, referenceDate: new Date('2025-01-05T00:00:00Z') },
      update: { referenceDate: new Date('2025-01-05T00:00:00Z') },
    });
    await recalc();
    const cleared = await get(syringe.id);
    expect(cleared.status).toBe('CLEARED');
    expect(cleared.events.at(-1)).toMatchObject({ type: 'CLEARED', fromStatus: 'ACKNOWLEDGED', toStatus: 'CLEARED', user: null });
    expect(byItem(await list(), 'Syringe')).toHaveLength(0); // closed Alerts leave the panel
    expect(byItem(await list('?includeCleared=true'), 'Syringe')).toHaveLength(1);

    // A Cleared Alert is closed: no transitions, but comments are still welcome.
    await setStatus(syringe.id, 'VIEWED').expect(409);
    await http().post(`/api/alerts/${syringe.id}/comments`).set('Cookie', cookie).send({ comment: 'Stock arrived' }).expect(201);

    // The Item deteriorates again: a new Alert, the old one stays Cleared.
    await resetSettings();
    await recalc();
    const syringeAlerts = byItem(await list('?includeCleared=true'), 'Syringe');
    expect(syringeAlerts.map((a) => a.status).sort()).toEqual(['CLEARED', 'NEW']);
    expect(syringeAlerts[0].id).not.toBe(syringeAlerts[1].id);
  });

  it('lists an Item\'s Alerts with history and comments', async () => {
    const syringe = await prisma.item.findFirstOrThrow({ where: { name: 'Syringe' } });
    const res = await http().get(`/api/items/${syringe.id}/alerts`).set('Cookie', cookie).expect(200);
    const alerts = res.body as AlertBody[];
    expect(alerts).toHaveLength(2);
    expect(alerts[0].status).toBe('NEW'); // newest first
    expect(alerts[1].status).toBe('CLEARED');
    expect(alerts[1].events.some((e) => e.type === 'COMMENTED')).toBe(true);
    await http().get('/api/items/abc/alerts').set('Cookie', cookie).expect(400);
  });

  it('shows a removed author as "Name (removed)"', async () => {
    const [monitor] = byItem(await list(), 'Monitor');
    const ana = await prisma.user.findFirstOrThrow({ where: { email: 'ana@hospital.test' } });
    await http().post(`/api/alerts/${monitor.id}/comments`).set('Cookie', memberCookie).send({ comment: 'Reviewed' }).expect(201);
    await prisma.user.update({ where: { id: ana.id }, data: { status: 'REMOVED' } });
    const detail = await get(monitor.id);
    expect(detail.events.at(-1)?.user?.name).toBe('Nurse Ana (removed)');
  });

  it('lets other tickets change status "via Recommendation #N" and Reopen with a reason', async () => {
    const service = app.get(AlertsService);
    const [monitor] = byItem(await list(), 'Monitor');
    await service.changeStatusViaRecommendation(monitor.id, 'ACKNOWLEDGED', 7);
    let detail = await get(monitor.id);
    expect(detail.status).toBe('ACKNOWLEDGED');
    expect(detail.events.at(-1)).toMatchObject({ type: 'STATUS_CHANGED', user: null, note: 'via Recommendation #7' });

    await service.reopenAlert(monitor.id, 'expected delivery overdue');
    detail = await get(monitor.id);
    expect(detail).toMatchObject({ status: 'NEW', reason: 'expected delivery overdue' });
    expect(detail.events.at(-1)).toMatchObject({ type: 'REOPENED', fromStatus: 'ACKNOWLEDGED', toStatus: 'NEW', user: null });
  });

  it('allows only one open Alert per Item at the database level', async () => {
    const monitor = await prisma.item.findFirstOrThrow({ where: { name: 'Monitor' } });
    await expect(prisma.alert.create({ data: { itemId: monitor.id, level: 'CRITICAL' } })).rejects.toThrow();
  });
});
