// Item detail API against the test database, loaded from fixtures/indicators (see items.e2e-spec.ts for the
// hand-computed Items). Syringe (V001, contracted 5 days): Snapshots 01-01 (stock 100, min 20, max 200, usage 5,
// Replenishment Time 4) and 01-06 (stock 60, usage 10, Replenishment Time 8); observed mean over 01-01..01-10 is 6.
// Ventilator has stock 1000 > max 800 on both Snapshots (Data Quality Flag).
import type { INestApplication } from '@nestjs/common';
import * as path from 'node:path';
import request from 'supertest';
import { runEtl } from '../src/etl/run-etl';
import { PrismaService } from '../src/prisma/prisma.service';
import { seedDirector } from '../src/users/director-seed';
import { createTestApp, DIRECTOR } from './app';
import { FIXTURES, resetDatabase } from './helpers';

describe('Item detail API', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let cookie: string;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    await resetDatabase(prisma);
    await seedDirector(prisma);
    await runEtl(prisma, path.join(FIXTURES, 'indicators'));
    const res = await http().post('/api/auth/login').send({ email: DIRECTOR.email, password: DIRECTOR.password }).expect(200);
    cookie = (res.headers['set-cookie'] as unknown as string[])[0].split(';')[0];
  });
  afterEach(async () => {
    await prisma.thresholdOverride.deleteMany();
    await prisma.vendor.update({ where: { code: 'V001' }, data: { contractedLeadTimeDays: 5 } });
  });
  afterAll(async () => {
    await app.close();
  });

  const idOf = async (name: string) => (await prisma.item.findFirstOrThrow({ where: { name } })).id;
  async function detail(name: string, query = '') {
    const res = await http().get(`/api/items/${await idOf(name)}/detail${query}`).set('Cookie', cookie).expect(200);
    return res.body;
  }

  it('requires login', async () => {
    await http().get(`/api/items/${await idOf('Syringe')}/detail`).expect(401);
  });

  it('returns 404 for an unknown Item', async () => {
    await http().get('/api/items/99999/detail').set('Cookie', cookie).expect(404);
  });

  it('returns the header, indicators, trend and Estimated Demand', async () => {
    const body = await detail('Syringe');
    expect(body.period).toEqual({ start: '2025-01-01', end: '2025-01-10' });
    expect(body.item).toMatchObject({ name: 'Syringe', category: 'Consumable', vendorCode: 'V001', vendorName: 'MedSupplies Inc.' });
    expect(body.indicators.stockStatus).toBe('REORDER_NEEDED');
    expect(body.indicators.urgencyLevel).toBe('ATTENTION');
    expect(body.consumptionTrendPct).toBeCloseTo(100, 10);
    expect(body.estimatedDemand30d).toBeCloseTo(225, 10);
  });

  it('returns the carried-forward daily series with the Snapshot minimum and maximum', async () => {
    const { series } = await detail('Syringe');
    expect(series).toHaveLength(10);
    expect(series[0]).toMatchObject({ date: '2025-01-01', currentStock: 100, minRequired: 20, maxCapacity: 200, avgUsagePerDay: 5 });
    expect(series[4]).toMatchObject({ date: '2025-01-05', currentStock: 100 });
    expect(series[5]).toMatchObject({ date: '2025-01-06', currentStock: 60, avgUsagePerDay: 10, replenishmentTimeDays: 8 });
    expect(series[9]).toMatchObject({ currentStock: 60 });
  });

  it('has no stock before the first Snapshot', async () => {
    const { series } = await detail('Pump Set');
    expect(series[0]).toMatchObject({ date: '2025-01-01', currentStock: null, minRequired: null, maxCapacity: null });
    expect(series[7]).toMatchObject({ date: '2025-01-08', currentStock: 10 });
  });

  it('applies Threshold Overrides to the minimum and maximum lines', async () => {
    await prisma.thresholdOverride.create({ data: { itemId: await idOf('Syringe'), minRequired: 150 } });
    const body = await detail('Syringe');
    expect(body.thresholdOverride).toEqual({ minRequired: 150, maxCapacity: null });
    for (const p of body.series) {
      expect(p.minRequired).toBe(150);
      expect(p.maxCapacity).toBe(200);
    }
    expect(body.indicators.stockStatus).toBe('BELOW_MINIMUM');
  });

  it('flags a lead time mismatch (contracted 5 vs observed 6) and clears it when they match', async () => {
    const body = await detail('Syringe');
    expect(body.leadTime.contractedDays).toBe(5);
    expect(body.leadTime.observedDays).toBeCloseTo(6, 10);
    expect(body.leadTime.differenceDays).toBeCloseTo(-1, 10);
    expect(body.leadTime.mismatch).toBe(true);

    await prisma.vendor.update({ where: { code: 'V001' }, data: { contractedLeadTimeDays: 6 } });
    expect((await detail('Syringe')).leadTime.mismatch).toBe(false);
  });

  it('lists the Snapshots with their Data Quality Flags', async () => {
    const vent = await detail('Ventilator');
    expect(vent.snapshots).toHaveLength(2);
    for (const s of vent.snapshots) {
      expect(s.stockAboveMaxCapacity).toBe(true);
      expect(s.dataQuality).toBe(true);
    }
    const syringe = await detail('Syringe');
    expect(syringe.snapshots.map((s: { date: string }) => s.date)).toEqual(['2025-01-01', '2025-01-06']);
    expect(syringe.snapshots.every((s: { dataQuality: boolean }) => !s.dataQuality)).toBe(true);
  });

  it('honours the period filter', async () => {
    const body = await detail('Syringe', '?from=2025-01-06&to=2025-01-08');
    expect(body.period).toEqual({ start: '2025-01-06', end: '2025-01-08' });
    expect(body.series.map((p: { date: string }) => p.date)).toEqual(['2025-01-06', '2025-01-07', '2025-01-08']);
    expect(body.snapshots).toHaveLength(1);
    expect(body.leadTime.observedDays).toBeCloseTo(8, 10);

    const early = await detail('Syringe', '?to=2025-01-05');
    expect(early.indicators.state.currentStock).toBe(100);
    expect(early.snapshots).toHaveLength(1);
  });

  it('rejects an invalid period with 400', async () => {
    const id = await idOf('Syringe');
    await http().get(`/api/items/${id}/detail?from=2025-01-09&to=2025-01-02`).set('Cookie', cookie).expect(400);
  });
});
