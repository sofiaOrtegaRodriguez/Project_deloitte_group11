// Charts API on the fixtures/indicators data (hand-computed values: see dashboard.e2e-spec.ts).
//   Period 2025-01-06..2025-01-10 (5 days), previous period 2025-01-01..2025-01-05.
//   Stock Value per Item at 2025-01-10: Ventilator 20000 (class A), Syringe 600, Monitor 150, Gauze 100, Pump Set 10 (class C).
//   Categories (Item_Type): Equipment = Ventilator, Monitor; Consumable = Syringe, Gauze, Pump Set. Vendor V001 = Syringe, Gauze, Pump Set.
//   Series, current:  01-06 stock 600+20000+150+100 = 20850, usage 100+1000+15+0 = 1115;
//                     01-08 Pump Set joins: stock 20860, usage 1116.
//   Series, previous: 01-01 stock 1000+20000+100 = 21100, usage 50+1000+0 = 1050;  01-04 Monitor joins: 21250, 1065.
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { runEtl } from '../src/etl/run-etl';
import { PrismaService } from '../src/prisma/prisma.service';
import { seedDirector } from '../src/users/director-seed';
import { createTestApp, DIRECTOR } from './app';
import { FIXTURES, resetDatabase } from './helpers';
import * as path from 'node:path';

describe('Charts API', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let cookie: string;
  const http = () => request(app.getHttpServer());
  const PERIOD = 'from=2025-01-06&to=2025-01-10';
  const abc = (query = '') => http().get(`/api/charts/abc?${PERIOD}${query}`).set('Cookie', cookie);
  const series = (query = '') => http().get(`/api/charts/series?${PERIOD}${query}`).set('Cookie', cookie);
  type Slice = { key: string; stockValue: number; previousStockValue: number | null; itemCount: number; pct: number };

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
    await http().get('/api/charts/abc').expect(401);
    await http().get('/api/charts/series').expect(401);
  });

  it('rejects bad filters and bad drill-down parameters with 400', async () => {
    await http().get('/api/charts/series?from=nope').set('Cookie', cookie).expect(400);
    await http().get('/api/charts/series?from=2025-01-10&to=2025-01-01').set('Cookie', cookie).expect(400);
    await http().get('/api/charts/series?abcClass=Z').set('Cookie', cookie).expect(400);
    await http().get('/api/charts/abc?abcClass=Z').set('Cookie', cookie).expect(400);
    await abc('&level=galaxy').expect(400);
    await abc('&level=category').expect(400); // needs parentClass
    await abc('&level=item&parentClass=C').expect(400); // needs parentCategory
    await abc('&parentClass=Q&level=category').expect(400);
    await abc('&parentClass=A').expect(400); // class level takes no parent
  });

  describe('series', () => {
    it('returns the current and previous period aligned by day offset', async () => {
      const { body } = await series().expect(200);
      expect(body.period).toEqual({ start: '2025-01-06', end: '2025-01-10' });
      expect(body.previousPeriod).toEqual({ start: '2025-01-01', end: '2025-01-05' });
      expect(body.current).toHaveLength(5);
      expect(body.previous).toHaveLength(5);
      expect(body.current.map((p: { offset: number }) => p.offset)).toEqual([0, 1, 2, 3, 4]);
      expect(body.previous.map((p: { offset: number }) => p.offset)).toEqual([0, 1, 2, 3, 4]);

      expect(body.current[0]).toMatchObject({ date: '2025-01-06', stockValue: 20850, consumptionValue: 1115 });
      expect(body.current[2]).toMatchObject({ date: '2025-01-08', stockValue: 20860, consumptionValue: 1116 });
      expect(body.previous[0]).toMatchObject({ date: '2025-01-01', stockValue: 21100, consumptionValue: 1050 });
      expect(body.previous[3]).toMatchObject({ date: '2025-01-04', stockValue: 21250, consumptionValue: 1065 });
    });

    it('carries the Inventory Availability daily series, ending where the dashboard KPI does', async () => {
      const { body } = await series().expect(200);
      expect(body.current[4].inventoryAvailabilityPct).toBeCloseTo(80, 10);
      expect(body.previous[4].inventoryAvailabilityPct).toBeCloseTo(75, 10);
      // 01-01: Syringe, Ventilator, Gauze all at or above minimum.
      expect(body.previous[0].inventoryAvailabilityPct).toBeCloseTo(100, 10);
    });

    it('applies the shared filters to both periods', async () => {
      const { body } = await series('&vendor=V001').expect(200);
      expect(body.current[0]).toMatchObject({ stockValue: 700, consumptionValue: 100 }); // Syringe 600 + Gauze 100
      expect(body.previous[0]).toMatchObject({ stockValue: 1100, consumptionValue: 50 }); // Syringe 1000 + Gauze 100

      const equipment = await series('&category=Equipment').expect(200);
      expect(equipment.body.current[0].stockValue).toBe(20150);
    });

    it('has no previous series when the previous period lies before the data', async () => {
      const { body } = await http().get('/api/charts/series').set('Cookie', cookie).expect(200);
      expect(body.current).toHaveLength(10);
      expect(body.previous).toEqual([]);
    });
  });

  describe('ABC drill-down', () => {
    it('level 1: classes by Stock Value, with the previous period', async () => {
      const { body } = await abc().expect(200);
      expect(body.level).toBe('class');
      expect(body.totalStockValue).toBe(20860);
      const slices: Slice[] = body.slices;
      expect(slices.map((s) => s.key)).toEqual(['A', 'C']);
      expect(slices[0]).toMatchObject({ stockValue: 20000, previousStockValue: 20000, itemCount: 1 });
      expect(slices[0].pct).toBeCloseTo((20000 / 20860) * 100, 10);
      expect(slices[1]).toMatchObject({ stockValue: 860, previousStockValue: 1250, itemCount: 4 });
    });

    it('level 2: the Categories of a class', async () => {
      const { body } = await abc('&level=category&parentClass=C').expect(200);
      expect(body.level).toBe('category');
      expect(body.totalStockValue).toBe(860);
      expect(body.slices).toEqual([
        expect.objectContaining({ key: 'Consumable', stockValue: 710, previousStockValue: 1100, itemCount: 3 }),
        expect.objectContaining({ key: 'Equipment', stockValue: 150, previousStockValue: 150, itemCount: 1 }),
      ]);
    });

    it('level 3: the Items of a Category, largest first', async () => {
      const { body } = await abc('&level=item&parentClass=C&parentCategory=Consumable').expect(200);
      const slices: (Slice & { label: string })[] = body.slices;
      expect(slices.map((s) => [s.label, s.stockValue, s.previousStockValue])).toEqual([
        ['Syringe', 600, 1000],
        ['Gauze', 100, 100],
        ['Pump Set', 10, 0],
      ]);
    });

    it('respects the shared filters but keeps each Item class from the whole portfolio', async () => {
      const { body } = await abc('&vendor=V001').expect(200);
      // Ventilator (V002) is out of the slice; Syringe, Gauze and Pump Set keep class C.
      expect(body.slices.map((s: Slice) => s.key)).toEqual(['C']);
      expect(body.totalStockValue).toBe(710);
    });

    it('is empty (not an error) for a class without Items', async () => {
      const { body } = await abc('&level=category&parentClass=B').expect(200);
      expect(body.slices).toEqual([]);
    });
  });
});
