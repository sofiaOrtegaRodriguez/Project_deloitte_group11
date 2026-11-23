// Dashboard API on the fixtures/indicators data (hand-computed values: see items.e2e-spec.ts).
//   Period 2025-01-06..2025-01-10 (5 days), previous period 2025-01-01..2025-01-05 (same length).
//   Current  (state 2025-01-10): Stock Value 20860, Excess 4000, availability 80, below minimum 1, median autonomy 10.
//   Previous (state 2025-01-05): Stock Value 21250, availability 75, median autonomy 20.
//   Deltas: Stock Value -390, availability +5, median autonomy -10.
//   Urgency counts at 2025-01-10: Critical 1 (Monitor), Attention 1 (Syringe, priority 200), Normal 3.
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { runEtl } from '../src/etl/run-etl';
import { PrismaService } from '../src/prisma/prisma.service';
import { seedDirector } from '../src/users/director-seed';
import { createTestApp, DIRECTOR } from './app';
import { FIXTURES, resetDatabase } from './helpers';
import * as path from 'node:path';

describe('Dashboard API', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let cookie: string;
  const http = () => request(app.getHttpServer());
  const get = (query = '') => http().get(`/api/dashboard${query}`).set('Cookie', cookie);

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    await resetDatabase(prisma);
    await seedDirector(prisma);
    await runEtl(prisma, path.join(FIXTURES, 'indicators'));
    const res = await http().post('/api/auth/login').send({ email: DIRECTOR.email, password: DIRECTOR.password }).expect(200);
    cookie = (res.headers['set-cookie'] as unknown as string[])[0].split(';')[0];
  });
  afterAll(async () => {
    await app.close();
  });

  it('requires login', async () => {
    await http().get('/api/dashboard').expect(401);
  });

  it('returns the 7 KPIs for the period and for the previous period of the same length', async () => {
    const { body } = await get('?from=2025-01-06&to=2025-01-10').expect(200);

    expect(body.referenceDate).toBe('2025-01-10');
    expect(body.period).toEqual({ start: '2025-01-06', end: '2025-01-10' });
    expect(body.previousPeriod).toEqual({ start: '2025-01-01', end: '2025-01-05' });

    expect(body.current.stockValue).toBe(20860);
    expect(body.current.excessStockValue).toBe(4000);
    expect(body.current.inventoryAvailabilityPct).toBeCloseTo(80, 10);
    expect(body.current.belowMinimumCount).toBe(1);
    expect(body.current.medianAutonomyDays).toBeCloseTo(10, 10);
    expect(body.current.weightedTurnover).toEqual(expect.any(Number));
    expect(body.current.meanReplenishmentTimeDays).toEqual(expect.any(Number));

    expect(body.previous.stockValue).toBe(21250);
    expect(body.previous.inventoryAvailabilityPct).toBeCloseTo(75, 10);
    expect(body.previous.medianAutonomyDays).toBeCloseTo(20, 10);

    expect(body.deltas.stockValue.absolute).toBe(-390);
    expect(body.deltas.stockValue.pct).toBeCloseTo((-390 / 21250) * 100, 10);
    expect(body.deltas.inventoryAvailabilityPct.absolute).toBeCloseTo(5, 10);
    expect(body.deltas.medianAutonomyDays.absolute).toBeCloseTo(-10, 10);
  });

  it('the previous period equals what /api/items reports for that period', async () => {
    const { body } = await get('?from=2025-01-06&to=2025-01-10').expect(200);
    const items = await http().get('/api/items?from=2025-01-01&to=2025-01-05').set('Cookie', cookie).expect(200);
    const p = items.body.portfolio;
    expect(body.previous.excessStockValue).toBe(p.excessStockValue);
    expect(body.previous.belowMinimumCount).toBe(p.belowMinimumCount);
    expect(body.previous.weightedTurnover).toBeCloseTo(p.weightedTurnover, 10);
    expect(body.previous.meanReplenishmentTimeDays).toBeCloseTo(p.meanReplenishmentTimeDays, 10);
  });

  it('counts Items per Urgency Level and ranks the top Items by Priority Score', async () => {
    const { body } = await get().expect(200);
    expect(body.urgencyCounts).toEqual({ CRITICAL: 1, ATTENTION: 1, NORMAL: 3 });
    expect(body.topItems.length).toBeLessThanOrEqual(10);
    const scores = body.topItems.map((i: { priorityScore: number }) => i.priorityScore);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
    const syringe = body.topItems.find((i: { name: string }) => i.name === 'Syringe');
    expect(syringe).toMatchObject({ urgencyLevel: 'ATTENTION' });
    expect(syringe.priorityScore).toBeCloseTo(200, 10);
    expect(body.topItems.find((i: { name: string }) => i.name === 'Monitor')).toMatchObject({ urgencyLevel: 'CRITICAL' });
  });

  it('has no comparison when the previous period lies before the data', async () => {
    const { body } = await get().expect(200); // default period = the whole dataset
    expect(body.current.stockValue).toBe(20860);
    expect(body.previous).toBeNull();
    expect(body.deltas.stockValue).toEqual({ absolute: null, pct: null });
  });

  it('rejects malformed or reversed periods', async () => {
    await get('?from=yesterday').expect(400);
    await get('?from=2025-01-09&to=2025-01-02').expect(400);
    await get('?to=2025-02-30').expect(400);
  });
});
