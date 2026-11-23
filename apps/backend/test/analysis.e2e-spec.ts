// Analysis API on the fixtures/indicators data (hand-computed values; see dashboard.e2e-spec.ts and charts.e2e-spec.ts).
//   Period 2025-01-06..2025-01-10, previous period 2025-01-01..2025-01-05.
//   Categories: Consumable = Syringe, Gauze, Pump Set (vendor V001); Equipment = Ventilator (V002), Monitor (V003).
//   Current (state 01-10): Syringe stock 60 (value 600, autonomy 6), Ventilator value 20000 (excess 4000, autonomy 20),
//     Monitor value 150 (below minimum, autonomy 10), Gauze value 100 (no usage), Pump Set value 10 (autonomy 10).
//     ABC: Ventilator A (20000 of 20860 = 95.9%), everything else C.
//   Previous (state 01-05): Syringe 100 x 10 = 1000 (autonomy 20), Ventilator 20000, Monitor 150 (below minimum), Gauze 100.
//     No Pump Set yet. ABC: Ventilator A, the other three C.
import type { INestApplication } from '@nestjs/common';
import * as fs from 'node:fs';
import * as path from 'node:path';
import request from 'supertest';
import { runEtl } from '../src/etl/run-etl';
import { PrismaService } from '../src/prisma/prisma.service';
import { seedDirector } from '../src/users/director-seed';
import { createTestApp, DIRECTOR } from './app';
import { copyFixture, FIXTURES, resetDatabase } from './helpers';

describe('Analysis API', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let cookie: string;
  const http = () => request(app.getHttpServer());
  const PERIOD = 'from=2025-01-06&to=2025-01-10';
  const get = (route: string, query = '') => http().get(`/api/analysis/${route}?${PERIOD}${query}`).set('Cookie', cookie);
  const compare = (by: string, query = '') => get('compare', `&by=${by}${query}`);
  type Row = { key: string; label: string; current: Record<string, number | null>; previous: Record<string, number | null> | null };
  const rowOf = (groups: Row[], key: string) => groups.find((g) => g.key === key)!;

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
    for (const route of ['trends', 'compare?by=category', 'consumption-trends', 'category-summary']) {
      await http().get(`/api/analysis/${route}`).expect(401);
    }
  });

  it('rejects a bad dimension, bad filters and bad parameters with 400', async () => {
    await http().get('/api/analysis/compare').set('Cookie', cookie).expect(400); // by is required
    await compare('galaxy').expect(400);
    await get('compare', '&by=category&abcClass=Z').expect(400);
    await http().get('/api/analysis/compare?by=category&from=nope').set('Cookie', cookie).expect(400);
    await http().get('/api/analysis/trends?from=2025-01-10&to=2025-01-01').set('Cookie', cookie).expect(400);
    await get('trends', '&urgencyLevel=SOON').expect(400);
    await get('category-summary', '&vendor=').expect(400);
    await get('consumption-trends', '&minPct=abc').expect(400);
    await get('consumption-trends', '&minPct=-5').expect(400);
    await get('consumption-trends', '&top=0').expect(400);
    await get('consumption-trends', '&top=2.5').expect(400);
  });

  describe('trends', () => {
    it('carries every indicator for the current period and the previous one aligned by offset', async () => {
      const { body } = await get('trends').expect(200);
      expect(body.period).toEqual({ start: '2025-01-06', end: '2025-01-10' });
      expect(body.previousPeriod).toEqual({ start: '2025-01-01', end: '2025-01-05' });
      expect(body.current.map((p: { offset: number }) => p.offset)).toEqual([0, 1, 2, 3, 4]);
      expect(body.previous.map((p: { offset: number }) => p.offset)).toEqual([0, 1, 2, 3, 4]);

      // 01-06: Syringe 60, Ventilator 20000, Monitor 150, Gauze 100.
      expect(body.current[0]).toMatchObject({ date: '2025-01-06', stockValue: 20850, excessStockValue: 4000, belowMinimumCount: 1 });
      expect(body.current[0].inventoryAvailabilityPct).toBeCloseTo(75, 10);
      expect(body.current[0].medianAutonomyDays).toBeCloseTo(10, 10); // autonomies 6, 20, 10
      expect(body.current[0].stockTurnover).toBeCloseTo((1115 * 365) / 20850, 10);
      expect(body.current[0].replenishmentTimeDays).toBeCloseTo(6.25, 10); // (8 + 10 + 2 + 5) / 4
      // 01-10: Pump Set has joined (stock 10, usage 1, RT 1).
      expect(body.current[4]).toMatchObject({ stockValue: 20860, belowMinimumCount: 1 });
      expect(body.current[4].medianAutonomyDays).toBeCloseTo(10, 10); // 6, 20, 10, 10
      expect(body.current[4].replenishmentTimeDays).toBeCloseTo(26 / 5, 10); // (8 + 10 + 2 + 5 + 1) / 5

      // 01-01: Syringe 100, Ventilator, Gauze (Monitor joins on 01-04).
      expect(body.previous[0]).toMatchObject({ date: '2025-01-01', stockValue: 21100, excessStockValue: 4000, belowMinimumCount: 0 });
      expect(body.previous[0].medianAutonomyDays).toBeCloseTo(20, 10);
      expect(body.previous[0].replenishmentTimeDays).toBeCloseTo(19 / 3, 10); // (4 + 10 + 5) / 3
      expect(body.previous[0].stockTurnover).toBeCloseTo((1050 * 365) / 21100, 10);
      expect(body.previous[4]).toMatchObject({ stockValue: 21250, belowMinimumCount: 1 });
    });

    it('applies the shared filters to both periods', async () => {
      const { body } = await get('trends', '&category=Equipment').expect(200);
      expect(body.current[0]).toMatchObject({ stockValue: 20150, excessStockValue: 4000, belowMinimumCount: 1 });
      expect(body.previous[0]).toMatchObject({ stockValue: 20000, belowMinimumCount: 0 }); // Monitor not there yet
    });

    it('returns an empty previous series when the slice has no state before the period', async () => {
      const { body } = await http()
        .get('/api/analysis/trends?from=2025-01-01&to=2025-01-03&category=Equipment')
        .set('Cookie', cookie)
        .expect(200);
      expect(body.current).toHaveLength(3);
      expect(body.previous).toEqual([]);
    });
  });

  describe('compare', () => {
    it('by category: KPIs per Category for both periods', async () => {
      const { body } = await compare('category').expect(200);
      expect(body.by).toBe('category');
      expect(body.groups.map((g: Row) => g.key)).toEqual(['Consumable', 'Equipment']);

      const consumable = rowOf(body.groups, 'Consumable');
      expect(consumable.current).toMatchObject({ itemCount: 3, stockValue: 710, excessStockValue: 0, belowMinimumCount: 0 });
      expect(consumable.current.inventoryAvailabilityPct).toBeCloseTo(100, 10);
      expect(consumable.current.medianAutonomyDays).toBeCloseTo(8, 10); // Syringe 6, Pump Set 10
      expect(consumable.previous).toMatchObject({ itemCount: 2, stockValue: 1100 });
      expect(consumable.previous!.medianAutonomyDays).toBeCloseTo(20, 10); // Syringe only

      const equipment = rowOf(body.groups, 'Equipment');
      expect(equipment.current).toMatchObject({ itemCount: 2, stockValue: 20150, excessStockValue: 4000, belowMinimumCount: 1 });
      expect(equipment.current.inventoryAvailabilityPct).toBeCloseTo(50, 10);
      expect(equipment.current.medianAutonomyDays).toBeCloseTo(15, 10);
      expect(equipment.current.weightedTurnover).toEqual(expect.any(Number));
      expect(equipment.current.meanReplenishmentTimeDays).toBeCloseTo(6, 10); // Ventilator 10, Monitor 2
      expect(equipment.previous).toMatchObject({ itemCount: 2, stockValue: 20150, belowMinimumCount: 1 });
    });

    it('by vendor', async () => {
      const { body } = await compare('vendor').expect(200);
      expect(body.groups.map((g: Row) => g.key)).toEqual(['V001', 'V002', 'V003']);
      expect(rowOf(body.groups, 'V001').current).toMatchObject({ itemCount: 3, stockValue: 710 });
      expect(rowOf(body.groups, 'V002').current).toMatchObject({ itemCount: 1, stockValue: 20000, excessStockValue: 4000 });
      expect(rowOf(body.groups, 'V003').current).toMatchObject({ itemCount: 1, stockValue: 150, belowMinimumCount: 1 });
      expect(rowOf(body.groups, 'V003').previous).toMatchObject({ itemCount: 1, stockValue: 150 });
    });

    it('by ABC Class: each period uses its own classification', async () => {
      const { body } = await compare('abcClass').expect(200);
      expect(body.groups.map((g: Row) => g.key)).toEqual(['A', 'C']);
      expect(rowOf(body.groups, 'A').label).toBe('Class A');
      expect(rowOf(body.groups, 'A').current).toMatchObject({ itemCount: 1, stockValue: 20000, excessStockValue: 4000 });
      expect(rowOf(body.groups, 'A').previous).toMatchObject({ itemCount: 1, stockValue: 20000 });
      expect(rowOf(body.groups, 'C').current).toMatchObject({ itemCount: 4, stockValue: 860, belowMinimumCount: 1 });
      expect(rowOf(body.groups, 'C').previous).toMatchObject({ itemCount: 3, stockValue: 1250, belowMinimumCount: 1 });
    });

    it('applies the shared filters; classification stays that of the whole portfolio', async () => {
      const byVendor = await compare('vendor', '&category=Equipment').expect(200);
      expect(byVendor.body.groups.map((g: Row) => g.key)).toEqual(['V002', 'V003']);

      const byCategory = await compare('category', '&abcClass=A').expect(200);
      expect(byCategory.body.groups.map((g: Row) => g.key)).toEqual(['Equipment']);
      expect(byCategory.body.groups[0].current).toMatchObject({ itemCount: 1, stockValue: 20000 });
      expect(byCategory.body.groups[0].previous).toMatchObject({ itemCount: 1, stockValue: 20000 });

      const none = await compare('category', '&category=Nothing').expect(200);
      expect(none.body.groups).toEqual([]);
    });
  });

  describe('category summary', () => {
    it('summarises Consumables and Equipment with the previous period', async () => {
      const { body } = await get('category-summary').expect(200);
      expect(body.groups.map((g: Row) => g.key)).toEqual(['Consumable', 'Equipment']);
      const consumable = rowOf(body.groups, 'Consumable');
      expect(consumable.current).toMatchObject({ itemCount: 3, stockValue: 710, excessStockValue: 0, belowMinimumCount: 0 });
      expect(consumable.current.averageAutonomyDays).toBeCloseTo(8, 10);
      expect(consumable.previous!.averageAutonomyDays).toBeCloseTo(20, 10);
      const equipment = rowOf(body.groups, 'Equipment');
      expect(equipment.current).toMatchObject({ itemCount: 2, stockValue: 20150, excessStockValue: 4000, belowMinimumCount: 1 });
      expect(equipment.current.inventoryAvailabilityPct).toBeCloseTo(50, 10);
      expect(equipment.current.averageAutonomyDays).toBeCloseTo(15, 10);
    });
  });

  describe('consumption trends', () => {
    it('lists the Items whose usage rose between the two halves of the period', async () => {
      // 01-01..01-10: Syringe usage 5 (01-01..01-05) then 10 -> +100%. Every other Item is flat or has no first half.
      const { body } = await http()
        .get('/api/analysis/consumption-trends?from=2025-01-01&to=2025-01-10')
        .set('Cookie', cookie)
        .expect(200);
      expect(body).toMatchObject({ minPct: 10, top: 10, falling: [] });
      expect(body.rising).toHaveLength(1);
      expect(body.rising[0]).toMatchObject({ itemId: expect.any(Number), name: 'Syringe', category: 'Consumable', vendorCode: 'V001', avgUsagePerDay: 10 });
      expect(body.rising[0].trendPct).toBeCloseTo(100, 10);
    });

    it('returns empty lists when nothing moves', async () => {
      const { body } = await get('consumption-trends').expect(200);
      expect(body.rising).toEqual([]);
      expect(body.falling).toEqual([]);
    });

    describe('with rising and falling Items', () => {
      // Ventilator usage 50 -> 25 on 01-07 (back to 50 on 01-10): second half mean 35 vs 50, -30%.
      // Monitor usage 3 -> 3.3 on 01-08: second half mean 3.18 vs 3, +6%.
      let tmp: string;
      beforeAll(async () => {
        tmp = copyFixture(path.join(FIXTURES, 'indicators'));
        const file = path.join(tmp, 'inventory_data.csv');
        fs.appendFileSync(file, '2025-01-07,102,Equipment,Ventilator,1000,100,800,20,25,10,V002\n');
        fs.appendFileSync(file, '2025-01-08,103,Equipment,Monitor,30,40,100,5,3.3,2,V003\n');
        await resetDatabase(prisma);
        await seedDirector(prisma);
        await runEtl(prisma, tmp);
      });
      afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));
      const trends = (query = '') =>
        http().get(`/api/analysis/consumption-trends?from=2025-01-01&to=2025-01-10${query}`).set('Cookie', cookie).expect(200);
      const names = (items: { name: string }[]) => items.map((i) => i.name);

      it('splits Items into rising (highest first) and falling (steepest first)', async () => {
        const { body } = await trends('&minPct=5');
        expect(names(body.rising)).toEqual(['Syringe', 'Monitor']);
        expect(body.rising[1].trendPct).toBeCloseTo(6, 8);
        expect(names(body.falling)).toEqual(['Ventilator']);
        expect(body.falling[0].trendPct).toBeCloseTo(-30, 8);
        expect(body.falling[0]).toMatchObject({ abcClass: 'A', minRequired: 100, maxCapacity: 800 });
      });

      it('honours the minimum |%| threshold and the top N', async () => {
        const defaults = (await trends()).body; // threshold 10: Monitor (+6%) drops out
        expect(names(defaults.rising)).toEqual(['Syringe']);
        expect(names(defaults.falling)).toEqual(['Ventilator']);
        expect(names((await trends('&minPct=50')).body.falling)).toEqual([]); // -30% is not enough
        expect(names((await trends('&minPct=0&top=1')).body.rising)).toEqual(['Syringe']);
      });

      it('applies the shared filters', async () => {
        const { body } = await trends('&minPct=5&category=Equipment');
        expect(names(body.rising)).toEqual(['Monitor']);
        expect(names(body.falling)).toEqual(['Ventilator']);
      });
    });
  });
});
