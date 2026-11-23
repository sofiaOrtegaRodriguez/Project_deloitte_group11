// Live monitor endpoint against the test database (fixtures/indicators, same five Items as recommendation-decisions).
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as path from 'node:path';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { hashPassword } from '../src/auth/password';
import { CLOCK, FakeClock } from '../src/clock/clock';
import { runEtl } from '../src/etl/run-etl';
import { PrismaService } from '../src/prisma/prisma.service';
import { runRecalculation } from '../src/recalculation/run-recalculation';
import { seedDirector } from '../src/users/director-seed';
import { DIRECTOR } from './app';
import { FIXTURES, resetDatabase } from './helpers';

const TEAM = { name: 'Team Member', email: 'team@hospital.test', password: 'team-password-1' };

interface Ev {
  id: string;
  source: string;
  type: string;
  message: string;
  actor: string;
  createdAt: string;
  alertId: number | null;
  recommendationId: number | null;
  itemId: number;
  itemName: string;
}

jest.setTimeout(60000);

describe('Live monitor API', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let director: string;
  let team: string;
  const clock = new FakeClock('2026-03-01T10:00:00Z');
  const http = () => request(app.getHttpServer());
  const monitor = async (qs = '', cookie = director) => (await http().get(`/api/monitor${qs}`).set('Cookie', cookie).expect(200)).body;

  async function login(email: string, password: string): Promise<string> {
    const res = await http().post('/api/auth/login').send({ email, password }).expect(200);
    return (res.headers['set-cookie'] as unknown as string[])[0].split(';')[0];
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(CLOCK).useValue(clock).compile();
    app = configureApp(moduleRef.createNestApplication());
    await app.init();
    prisma = app.get(PrismaService);
  });
  beforeEach(async () => {
    await resetDatabase(prisma);
    await seedDirector(prisma);
    await runEtl(prisma, path.join(FIXTURES, 'indicators'));
    await prisma.user.create({
      data: { name: TEAM.name, email: TEAM.email, passwordHash: await hashPassword(TEAM.password), role: 'PROCUREMENT_TEAM', status: 'ACTIVE' },
    });
    await runRecalculation(prisma);
    director = await login(DIRECTOR.email, DIRECTOR.password);
    team = await login(TEAM.email, TEAM.password);
  });
  afterEach(() => {
    delete process.env.LIVE_MONITOR_REFRESH_SECONDS;
  });
  afterAll(async () => {
    await app.close();
  });

  it('requires login but any role can read it', async () => {
    await http().get('/api/monitor').expect(401);
    await http().get('/api/monitor').set('Cookie', team).expect(200);
  });

  it('merges Alert and Recommendation events newest first, with messages and actors', async () => {
    const monitorItem = await prisma.item.findFirstOrThrow({ where: { name: 'Monitor' } });
    const drafts = (await http().get(`/api/recommendations?itemId=${monitorItem.id}&type=REPLENISH&status=DRAFT`).set('Cookie', director).expect(200)).body;
    const id = drafts[0].id as number;
    await http().post(`/api/recommendations/${id}/submit`).set('Cookie', team).expect(200);
    await http().post(`/api/recommendations/${id}/approve`).set('Cookie', director).expect(200);

    const body = await monitor('?limit=100');
    const events = body.events as Ev[];
    expect(events.some((e) => e.source === 'ALERT' && e.type === 'CREATED' && e.actor === 'system')).toBe(true);
    const created = events.find((e) => e.source === 'ALERT' && e.type === 'CREATED' && e.itemName === 'Monitor');
    expect(created?.message).toMatch(/^Alert #\d+ created \((Critical|Attention)\) — Monitor #\d+$/);
    expect(created?.alertId).not.toBeNull();
    expect(created?.itemId).toBe(monitorItem.id);

    const approved = events.find((e) => e.source === 'RECOMMENDATION' && e.type === 'APPROVED')!;
    expect(approved.message).toMatch(new RegExp(`^Recommendation #${id} approved by ${DIRECTOR.name} — Monitor #\\d+$`));
    expect(approved.actor).toBe(DIRECTOR.name);
    expect(approved.recommendationId).toBe(id);
    const submitted = events.find((e) => e.source === 'RECOMMENDATION' && e.type === 'SUBMITTED')!;
    expect(submitted.actor).toBe(TEAM.name);
    expect(events.find((e) => e.source === 'RECOMMENDATION' && e.type === 'CREATED')?.actor).toBe('system');

    const times = events.map((e) => e.createdAt);
    expect([...times].sort().reverse()).toEqual(times);
    expect(events.indexOf(approved)).toBeLessThan(events.indexOf(submitted));
    expect(new Set(events.map((e) => e.id)).size).toBe(events.length);
  });

  it('shows removed authors as "Name (removed)"', async () => {
    const item = await prisma.item.findFirstOrThrow({ where: { name: 'Monitor' } });
    const alert = await prisma.alert.findFirstOrThrow({ where: { itemId: item.id } });
    const user = await prisma.user.findFirstOrThrow({ where: { email: TEAM.email } });
    await prisma.alertEvent.create({ data: { alertId: alert.id, type: 'COMMENTED', userId: user.id, comment: 'hi' } });
    await prisma.user.update({ where: { id: user.id }, data: { status: 'REMOVED' } });
    const events = (await monitor()).events as Ev[];
    expect(events[0].actor).toBe('Team Member (removed)');
    expect(events[0].message).toContain('Team Member (removed) commented on Alert');
  });

  it('honours limit and since, and rejects bad values with 400', async () => {
    const all = (await monitor('?limit=100')).events as Ev[];
    expect(all.length).toBeGreaterThan(3);
    expect((await monitor()).events.length).toBe(Math.min(30, all.length));
    const two = (await monitor('?limit=2')).events as Ev[];
    expect(two.map((e) => e.id)).toEqual(all.slice(0, 2).map((e) => e.id));

    const item = await prisma.item.findFirstOrThrow({ where: { name: 'Monitor' } });
    const alert = await prisma.alert.findFirstOrThrow({ where: { itemId: item.id } });
    const later = new Date(Date.now() + 60_000);
    await prisma.alertEvent.create({ data: { alertId: alert.id, type: 'REMINDER', createdAt: later } });
    const since = new Date(Date.now() + 30_000).toISOString();
    const newer = (await monitor(`?since=${encodeURIComponent(since)}`)).events as Ev[];
    expect(newer).toHaveLength(1);
    expect(newer[0].type).toBe('REMINDER');
    expect(newer[0].message).toMatch(/^Reminder sent for Alert #\d+ — Monitor/);
    expect((await monitor(`?since=${encodeURIComponent(later.toISOString())}`)).events).toEqual([]);

    for (const bad of ['?limit=0', '?limit=101', '?limit=abc', '?limit=-3', '?limit=2.5', '?since=yesterday', '?since=']) {
      await http().get(`/api/monitor${bad}`).set('Cookie', director).expect(400);
    }
  });

  it('reflects a started Simulation and the Reference Date', async () => {
    let body = await monitor();
    expect(body.simulation).toMatchObject({ status: 'STOPPED', currentDate: null, speed: null });
    expect(body.simulation.datasetEnd).toBe('2025-01-10');

    await http().post('/api/simulation/start').set('Cookie', director).send({ startDate: '2025-01-05', secondsPerDay: 20 }).expect(200);
    body = await monitor();
    expect(body.simulation).toEqual({ status: 'RUNNING', currentDate: '2025-01-05', speed: 20, datasetEnd: '2025-01-10' });
    expect(body.referenceDate).toBe('2025-01-05');

    await http().post('/api/simulation/pause').set('Cookie', director).expect(200);
    expect((await monitor()).simulation.status).toBe('PAUSED');
  });

  it('reads the refresh interval from LIVE_MONITOR_REFRESH_SECONDS with a fallback of 30', async () => {
    expect((await monitor()).refreshSeconds).toBe(30);
    process.env.LIVE_MONITOR_REFRESH_SECONDS = '10';
    expect((await monitor()).refreshSeconds).toBe(10);
    for (const bad of ['0', '-5', 'abc', '', 'NaN']) {
      process.env.LIVE_MONITOR_REFRESH_SECONDS = bad;
      expect((await monitor()).refreshSeconds).toBe(30);
    }
  });

  it('KPI tiles equal the dashboard values', async () => {
    const dashboard = (await http().get('/api/dashboard').set('Cookie', director).expect(200)).body;
    const body = await monitor();
    expect(body.kpis).toEqual(dashboard.current);
    expect(Object.keys(body.kpis)).toHaveLength(7);
    expect(body.referenceDate).toBe(dashboard.referenceDate);
  });
});
