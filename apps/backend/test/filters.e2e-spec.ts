// Global Filters on the fixtures/indicators data (see items.e2e-spec.ts for the hand-computed values).
//   Items (ids): 1 Syringe (Consumable, V001), 2 Ventilator (Equipment, V002), 3 Monitor (Equipment, V003),
//                4 Gauze (Consumable, V001), 5 Pump Set (Consumable, V001; first Snapshot 2025-01-08).
//   At 2025-01-10: Syringe C / Attention / Reorder Needed; Ventilator A / Normal / Excess; Monitor C / Critical /
//   Below Minimum; Gauze C / Normal; Pump Set C / Normal. Stock Value: 600, 20000, 150, 100, 10.
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { runEtl } from '../src/etl/run-etl';
import { PrismaService } from '../src/prisma/prisma.service';
import { seedDirector } from '../src/users/director-seed';
import { createTestApp, DIRECTOR } from './app';
import { FIXTURES, resetDatabase } from './helpers';
import * as path from 'node:path';

interface Row {
  id: number;
  name: string;
  abcClass: string | null;
  hasState: boolean;
}

describe('Global filters', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let cookie: string;
  const http = () => request(app.getHttpServer());
  const items = (query = '') => http().get(`/api/items${query}`).set('Cookie', cookie);
  const dashboard = (query = '') => http().get(`/api/dashboard${query}`).set('Cookie', cookie);
  const names = (body: { items: Row[] }) => body.items.map((i) => i.name);

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

  it('requires login on the analytics endpoints and on the filter options', async () => {
    await http().get('/api/items?category=Equipment').expect(401);
    await http().get('/api/dashboard?category=Equipment').expect(401);
    await http().get('/api/filters/options').expect(401);
  });

  it('offers Categories, Vendors and Items as filter options', async () => {
    const { body } = await http().get('/api/filters/options').set('Cookie', cookie).expect(200);
    expect(body.categories).toEqual(['Consumable', 'Equipment']);
    expect(body.vendors).toEqual([
      { code: 'V001', name: 'MedSupplies Inc.' },
      { code: 'V002', name: 'EquipMed Co.' },
      { code: 'V003', name: 'HealthTools Ltd.' },
    ]);
    expect(body.items.map((i: { name: string }) => i.name)).toEqual(['Syringe', 'Ventilator', 'Monitor', 'Gauze', 'Pump Set']);
  });

  it('filters by Category, Vendor and Item, with repeated values OR-ed', async () => {
    expect(names((await items('?category=Equipment').expect(200)).body)).toEqual(['Ventilator', 'Monitor']);
    expect(names((await items('?vendor=V002&vendor=V003').expect(200)).body)).toEqual(['Ventilator', 'Monitor']);
    expect(names((await items('?itemId=1&itemId=4').expect(200)).body)).toEqual(['Syringe', 'Gauze']);
    expect((await items('?category=Equipment&category=Consumable').expect(200)).body.items).toHaveLength(5);
  });

  it('combines different filters with AND', async () => {
    const { body } = await items('?category=Consumable&vendor=V001&urgencyLevel=NORMAL').expect(200);
    expect(names(body)).toEqual(['Gauze', 'Pump Set']);
    expect(body.portfolio.itemsWithState).toBe(2);
    expect(body.portfolio.stockValue).toBe(110);

    const none = await items('?category=Equipment&abcClass=C&urgencyLevel=NORMAL').expect(200);
    expect(none.body.items).toEqual([]);
    expect(none.body.portfolio.itemsWithState).toBe(0);
    expect(none.body.portfolio.stockValue).toBe(0);
  });

  it('filters by ABC Class, Urgency Level and Stock Status', async () => {
    expect(names((await items('?abcClass=A').expect(200)).body)).toEqual(['Ventilator']);
    expect(names((await items('?abcClass=C').expect(200)).body)).toEqual(['Syringe', 'Monitor', 'Gauze', 'Pump Set']);
    expect(names((await items('?urgencyLevel=CRITICAL').expect(200)).body)).toEqual(['Monitor']);
    expect(names((await items('?urgencyLevel=CRITICAL&urgencyLevel=ATTENTION').expect(200)).body)).toEqual(['Syringe', 'Monitor']);
    expect(names((await items('?stockStatus=EXCESS').expect(200)).body)).toEqual(['Ventilator']);
    expect(names((await items('?stockStatus=BELOW_MINIMUM').expect(200)).body)).toEqual(['Monitor']);
    expect(names((await items('?stockStatus=REORDER_NEEDED').expect(200)).body)).toEqual(['Syringe']);
  });

  it('classifies the whole portfolio first: an Item keeps its ABC Class whatever the filter', async () => {
    // Alone, the Monitor would hold 100% of the value and be class A.
    const { body } = await items('?itemId=3').expect(200);
    expect(body.items).toHaveLength(1);
    expect(body.items[0].abcClass).toBe('C');
    expect(body.items[0].urgencyLevel).toBe('CRITICAL');
    expect(body.portfolio.abcCounts).toEqual({ A: 0, B: 0, C: 1 });
  });

  it('aggregates the Dashboard over the slice, with the same Items in the comparison period', async () => {
    const { body } = await dashboard('?from=2025-01-06&to=2025-01-10&category=Equipment').expect(200);
    expect(body.current.stockValue).toBe(20150);
    expect(body.current.belowMinimumCount).toBe(1);
    expect(body.current.inventoryAvailabilityPct).toBeCloseTo(50, 10);
    // Previous period 01-01..01-05: Ventilator 20000 + Monitor 150.
    expect(body.previous.stockValue).toBe(20150);
    expect(body.deltas.stockValue.absolute).toBe(0);
    expect(body.urgencyCounts).toEqual({ CRITICAL: 1, ATTENTION: 0, NORMAL: 1 });
    expect(body.topItems.map((i: { name: string }) => i.name)).toEqual(['Ventilator', 'Monitor']);
  });

  it('keeps the slice chosen on the current period when comparing (Syringe is Attention now, Normal before)', async () => {
    const { body } = await dashboard('?from=2025-01-06&to=2025-01-10&urgencyLevel=ATTENTION').expect(200);
    expect(body.current.stockValue).toBe(600);
    // Syringe at 2025-01-05 is its first Snapshot: stock 100 x 10.
    expect(body.previous.stockValue).toBe(1000);
  });

  it('returns the comparison period of the same length on /api/items and /api/dashboard', async () => {
    const days = (p: { start: string; end: string }) => (Date.parse(p.end) - Date.parse(p.start)) / 86_400_000 + 1;
    for (const query of ['?from=2025-01-08&to=2025-01-10', '?from=2025-01-03&to=2025-01-10&category=Consumable']) {
      const a = (await items(query).expect(200)).body;
      const b = (await dashboard(query).expect(200)).body;
      for (const body of [a, b]) {
        expect(days(body.previousPeriod)).toBe(days(body.period));
        expect(Date.parse(body.period.start) - Date.parse(body.previousPeriod.end)).toBe(86_400_000);
      }
      expect(a.previousPortfolio.stockValue).toBe(b.previous.stockValue);
      expect(a.portfolio.stockValue).toBe(b.current.stockValue);
    }
  });

  it('shows Items with their carried-forward Item State in a short period without Snapshots', async () => {
    const { body } = await items('?from=2025-01-08&to=2025-01-09').expect(200);
    const syringe = body.items.find((i: Row) => i.name === 'Syringe');
    expect(syringe.hasState).toBe(true);
    expect(syringe.state.currentStock).toBe(60); // Snapshot of 2025-01-06, carried forward
    expect(body.items).toHaveLength(5);
  });

  it('keeps Items without a state through attribute filters and drops them with classification filters', async () => {
    // Pump Set has no Snapshot on or before 2025-01-05.
    const byItem = await items('?from=2025-01-05&to=2025-01-05&itemId=5').expect(200);
    expect(byItem.body.items).toHaveLength(1);
    expect(byItem.body.items[0].hasState).toBe(false);
    const byClass = await items('?from=2025-01-05&to=2025-01-05&abcClass=C').expect(200);
    expect(names(byClass.body)).not.toContain('Pump Set');
  });

  it('answers 400 to an invalid filter', async () => {
    for (const query of [
      '?abcClass=Z',
      '?abcClass=A&abcClass=Z',
      '?urgencyLevel=SEVERE',
      '?stockStatus=broken',
      '?itemId=abc',
      '?itemId=-1',
      '?category=',
      '?vendor=',
      '?from=yesterday',
      '?from=2025-01-10&to=2025-01-01',
      '?unknown=1',
    ]) {
      await items(query).expect(400);
      await dashboard(query).expect(400);
    }
  });
});
