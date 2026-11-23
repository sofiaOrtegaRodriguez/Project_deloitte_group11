// Items API (indicators and classifications) against the test database, loaded by the ETL from
// fixtures/indicators. The expected values are the hand-computed ones documented in
// src/indicators/indicators.spec.ts (same five Items), plus Item 105 "Pump Set", whose first Snapshot is 2025-01-08:
//
//   Items (ids follow the first appearance in the CSV): 101 Syringe, 102 Ventilator, 103 Monitor, 104 Gauze, 105 Pump Set.
//   Dataset range 2025-01-01 .. 2025-01-10, so the default Reference Date is 2025-01-10 and the period 10 days.
//
//   Reference Date 2025-01-10:
//     Syringe    stock 60, autonomy 6, turnover 34.21875, Replenishment Time mean 6, Reorder Needed, Attention, priority 200
//     Ventilator stock 1000 > max 800: Excess, excess value 4000, turnover 18.25, Normal
//     Monitor    stock 30 < min 40: Below Minimum, Critical
//     Gauze      usage 0: autonomy null, turnover 0, Low-Turnover, Normal
//     Pump Set   stock 10, autonomy 10 > RT 1, turnover 3 days known: 1 x 365 / 10 = 36.5, Normal; no trend (no state in 1st half)
//     Stock Value 600 + 20000 + 150 + 100 + 10 = 20860; Excess 4000; median autonomy of (6, 20, 10, 10) = 10
//     Value-weighted turnover (27375 + 365000 + 5475 + 0 + 365) / (800 + 20000 + 150 + 100 + 10) = 398215 / 21060
//     Mean Replenishment Time (6 + 10 + 2 + 5 + 1) / 5 = 4.8;  Inventory Availability 4 of 5 = 80%
//     ABC: Ventilator holds 95.9% of the value, so it is A and the other four are C.
//
//   Reference Date 2025-01-05 (period 01-01..01-05, Pump Set has no state):
//     Syringe state is its first Snapshot: stock 100, autonomy 20, turnover 5 x 365 / 100 = 18.25, Normal
//     Stock Value 1000 + 20000 + 150 + 100 = 21250; median autonomy of (20, 20, 10) = 20; availability 3 of 4 = 75%
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { runEtl } from '../src/etl/run-etl';
import { seedDirector } from '../src/users/director-seed';
import * as recalculationModule from '../src/recalculation/run-recalculation';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp, DIRECTOR } from './app';
import { FIXTURES, resetDatabase } from './helpers';
import * as path from 'node:path';

const FIXTURE = path.join(FIXTURES, 'indicators');

interface ItemBody {
  id: number;
  name: string;
  category: string;
  hasState: boolean;
  state: Record<string, unknown> | null;
  stockAutonomyDays: number | null;
  stockTurnover: number | null;
  daysOfInventory: number | null;
  replenishmentTimeDays: number | null;
  abcClass: string | null;
  belowMinimum: boolean | null;
  minAboveMax: boolean | null;
  stockStatus: string | null;
  urgencyLevel: string | null;
  priorityScore: number | null;
  stockValue: number | null;
  excessStockValue: number | null;
  lowTurnover: boolean | null;
  consumptionTrendPct: number | null;
  estimatedDemand30d: number | null;
}

describe('Items API', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let cookie: string;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    await resetDatabase(prisma);
    await seedDirector(prisma);
    await runEtl(prisma, FIXTURE);
    const res = await http().post('/api/auth/login').send({ email: DIRECTOR.email, password: DIRECTOR.password }).expect(200);
    cookie = (res.headers['set-cookie'] as unknown as string[])[0].split(';')[0];
  });
  afterEach(async () => {
    await prisma.settings.deleteMany();
    await prisma.thresholdOverride.deleteMany();
  });
  afterAll(async () => {
    await app.close();
  });

  async function getItems(query = '') {
    const res = await http().get(`/api/items${query}`).set('Cookie', cookie).expect(200);
    const items = res.body.items as ItemBody[];
    const byName = (name: string) => items.find((i) => i.name === name)!;
    return { body: res.body, items, byName };
  }

  it('requires login', async () => {
    await http().get('/api/items').expect(401);
  });

  it('returns every Item with its indicators as of the default Reference Date (the dataset last date)', async () => {
    const { body, items, byName } = await getItems();

    expect(body.referenceDate).toBe('2025-01-10');
    expect(body.period).toEqual({ start: '2025-01-01', end: '2025-01-10' });
    expect(body.config).toEqual({
      abcThresholdA: 80,
      abcThresholdB: 95,
      urgencyFactor: 0.5,
      criticalAbcClasses: ['A', 'B'],
      lowTurnoverThreshold: 12,
    });
    expect(items.map((i) => i.name)).toEqual(['Syringe', 'Ventilator', 'Monitor', 'Gauze', 'Pump Set']);

    const syringe = byName('Syringe');
    expect(syringe.category).toBe('Consumable');
    expect(syringe.stockAutonomyDays).toBeCloseTo(6, 10);
    expect(syringe.stockTurnover).toBeCloseTo(34.21875, 10);
    expect(syringe.daysOfInventory).toBeCloseTo(10.6667, 4);
    expect(syringe.replenishmentTimeDays).toBeCloseTo(6, 10);
    expect(syringe.stockStatus).toBe('REORDER_NEEDED');
    expect(syringe.urgencyLevel).toBe('ATTENTION');
    expect(syringe.priorityScore).toBeCloseTo(200, 10);
    expect(syringe.stockValue).toBe(600);
    expect(syringe.consumptionTrendPct).toBeCloseTo(100, 10);
    expect(syringe.estimatedDemand30d).toBeCloseTo(225, 10);
    expect(syringe.abcClass).toBe('C');

    const ventilator = byName('Ventilator');
    expect(ventilator.stockStatus).toBe('EXCESS');
    expect(ventilator.excessStockValue).toBe(4000);
    expect(ventilator.stockTurnover).toBeCloseTo(18.25, 10);
    expect(ventilator.abcClass).toBe('A');
    expect(ventilator.urgencyLevel).toBe('NORMAL');

    const monitor = byName('Monitor');
    expect(monitor.belowMinimum).toBe(true);
    expect(monitor.stockStatus).toBe('BELOW_MINIMUM');
    expect(monitor.urgencyLevel).toBe('CRITICAL');
    expect(monitor.stockAutonomyDays).toBeCloseTo(10, 10);

    const gauze = byName('Gauze');
    expect(gauze.stockAutonomyDays).toBeNull();
    expect(gauze.stockTurnover).toBe(0);
    expect(gauze.lowTurnover).toBe(true);
    expect(gauze.stockStatus).toBe('NORMAL');

    const pump = byName('Pump Set');
    expect(pump.stockAutonomyDays).toBeCloseTo(10, 10);
    expect(pump.stockTurnover).toBeCloseTo(36.5, 10);
    expect(pump.consumptionTrendPct).toBeNull();
    expect(pump.urgencyLevel).toBe('NORMAL');
  });

  it('returns the portfolio aggregates', async () => {
    const { body } = await getItems();
    const p = body.portfolio;
    expect(p.itemsWithState).toBe(5);
    expect(p.stockValue).toBe(20860);
    expect(p.excessStockValue).toBe(4000);
    expect(p.medianAutonomyDays).toBeCloseTo(10, 10);
    expect(p.weightedTurnover).toBeCloseTo(398215 / 21060, 6);
    expect(p.meanReplenishmentTimeDays).toBeCloseTo(4.8, 10);
    expect(p.inventoryAvailabilityPct).toBeCloseTo(80, 10);
    expect(p.belowMinimumCount).toBe(1);
    expect(p.lowTurnoverCount).toBe(1);
    expect(p.urgencyCounts).toEqual({ CRITICAL: 1, ATTENTION: 1, NORMAL: 3 });
    expect(p.abcCounts).toEqual({ A: 1, B: 0, C: 4 });
    expect(p.stockStatusCounts).toEqual({ BELOW_MINIMUM: 1, REORDER_NEEDED: 1, EXCESS: 1, NORMAL: 2 });
  });

  it('uses the Reference Date setting: Item State as of 2025-01-05, carried forward', async () => {
    await prisma.settings.create({ data: { id: 1, referenceDate: new Date('2025-01-05T00:00:00Z') } });
    const { body, byName } = await getItems();

    expect(body.referenceDate).toBe('2025-01-05');
    expect(body.period).toEqual({ start: '2025-01-01', end: '2025-01-05' });
    const syringe = byName('Syringe');
    expect(syringe.state).toMatchObject({ snapshotDate: '2025-01-01', currentStock: 100 });
    expect(syringe.stockAutonomyDays).toBeCloseTo(20, 10);
    expect(syringe.stockTurnover).toBeCloseTo(18.25, 10);
    expect(syringe.stockStatus).toBe('NORMAL');
    expect(byName('Pump Set').hasState).toBe(false);
    expect(byName('Pump Set').stockStatus).toBeNull();

    expect(body.portfolio.itemsWithState).toBe(4);
    expect(body.portfolio.stockValue).toBe(21250);
    expect(body.portfolio.medianAutonomyDays).toBeCloseTo(20, 10);
    expect(body.portfolio.inventoryAvailabilityPct).toBeCloseTo(75, 10);
  });

  it('settings are read from the database: Low-Turnover threshold 20 makes the Ventilator (18.25) low-turnover', async () => {
    await prisma.settings.create({ data: { id: 1, lowTurnoverThreshold: 20 } });
    const { byName, body } = await getItems();
    expect(byName('Ventilator').lowTurnover).toBe(true);
    expect(byName('Syringe').lowTurnover).toBe(false);
    expect(body.config.lowTurnoverThreshold).toBe(20);
    expect(body.portfolio.lowTurnoverCount).toBe(2); // Ventilator and Gauze
    expect(body.referenceDate).toBe('2025-01-10'); // a null Reference Date still means the dataset's last date
  });

  it('Threshold Overrides take priority over the Snapshot thresholds', async () => {
    const syringe = await prisma.item.findFirstOrThrow({ where: { name: 'Syringe' } });
    const ventilator = await prisma.item.findFirstOrThrow({ where: { name: 'Ventilator' } });
    await prisma.thresholdOverride.create({ data: { itemId: syringe.id, minRequired: 150 } }); // stock 60 < 150
    await prisma.thresholdOverride.create({ data: { itemId: ventilator.id, maxCapacity: 50 } }); // (1000 - 50) x 20

    const { byName, body } = await getItems();
    expect(byName('Syringe').belowMinimum).toBe(true);
    expect(byName('Syringe').stockStatus).toBe('BELOW_MINIMUM');
    expect(byName('Syringe').urgencyLevel).toBe('CRITICAL');
    expect(byName('Syringe').state).toMatchObject({ minRequired: 150, maxCapacity: 200 });
    expect(byName('Ventilator').excessStockValue).toBe(19000);
    expect(body.portfolio.excessStockValue).toBe(19000);
    expect(body.portfolio.belowMinimumCount).toBe(2);
  });

  it('takes an optional period: to=2025-01-05 equals the Reference Date 2025-01-05', async () => {
    const { body, byName } = await getItems('?to=2025-01-05');
    expect(body.period).toEqual({ start: '2025-01-01', end: '2025-01-05' });
    expect(byName('Syringe').stockAutonomyDays).toBeCloseTo(20, 10);
  });

  it('a period with no Snapshot dates inside it uses the carried-forward state', async () => {
    const { byName } = await getItems('?from=2025-01-07&to=2025-01-09');
    const syringe = byName('Syringe'); // last Snapshot 01-06 (stock 60, usage 10, RT 8)
    expect(syringe.state).toMatchObject({ snapshotDate: '2025-01-06' });
    expect(syringe.stockTurnover).toBeCloseTo(60.8333, 4);
    expect(syringe.replenishmentTimeDays).toBeCloseTo(8, 10);
  });

  it('rejects malformed or reversed periods', async () => {
    await http().get('/api/items?from=yesterday').set('Cookie', cookie).expect(400);
    await http().get('/api/items?from=2025-01-09&to=2025-01-02').set('Cookie', cookie).expect(400);
    await http().get('/api/items?from=2025-02-30').set('Cookie', cookie).expect(400);
  });

  it('the ETL runs the recalculation when it finishes', async () => {
    const spy = jest.spyOn(recalculationModule, 'runRecalculation');
    try {
      await runEtl(prisma, FIXTURE);
      expect(spy).toHaveBeenCalledTimes(1);
    } finally {
      spy.mockRestore();
    }
  });

  it('keeps settings and Threshold Overrides when the ETL runs again', async () => {
    const monitor = await prisma.item.findFirstOrThrow({ where: { name: 'Monitor' } });
    await prisma.settings.create({ data: { id: 1, urgencyFactor: 1 } });
    await prisma.thresholdOverride.create({ data: { itemId: monitor.id, minRequired: 5 } });

    await runEtl(prisma, FIXTURE);

    expect(await prisma.settings.count()).toBe(1);
    const { byName } = await getItems();
    expect(byName('Monitor').belowMinimum).toBe(false); // the override (min 5) is still applied
  });
});
