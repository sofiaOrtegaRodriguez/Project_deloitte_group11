// Configuration and Threshold Overrides API against the fixtures/indicators dataset (see items.e2e-spec.ts
// for its hand-computed values: Syringe autonomy 6 and Replenishment Time 6, class C, Attention; Monitor is Critical).
import type { INestApplication } from '@nestjs/common';
import * as path from 'node:path';
import request from 'supertest';
import { hashPassword } from '../src/auth/password';
import { PrismaService } from '../src/prisma/prisma.service';
import * as recalculationModule from '../src/recalculation/run-recalculation';
import { runEtl } from '../src/etl/run-etl';
import { seedDirector } from '../src/users/director-seed';
import { createTestApp, DIRECTOR } from './app';
import { FIXTURES, resetDatabase } from './helpers';

interface ItemBody {
  id: number;
  name: string;
  abcClass: string | null;
  urgencyLevel: string | null;
  stockStatus: string | null;
  excessStockValue: number | null;
  lowTurnover: boolean | null;
  state: Record<string, unknown> | null;
}

describe('Settings API', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let director: string;
  let team: string;
  const http = () => request(app.getHttpServer());

  async function login(email: string, password: string): Promise<string> {
    const res = await http().post('/api/auth/login').send({ email, password }).expect(200);
    return (res.headers['set-cookie'] as unknown as string[])[0].split(';')[0];
  }
  async function getItems(cookie = director) {
    const res = await http().get('/api/items').set('Cookie', cookie).expect(200);
    const items = res.body.items as ItemBody[];
    return { body: res.body, byName: (name: string) => items.find((i) => i.name === name)! };
  }
  const patch = (body: object, cookie = director) => http().patch('/api/settings').set('Cookie', cookie).send(body);
  const itemId = async (name: string) => (await prisma.item.findFirstOrThrow({ where: { name } })).id;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    await resetDatabase(prisma);
    await seedDirector(prisma);
    await runEtl(prisma, path.join(FIXTURES, 'indicators'));
    await prisma.user.create({
      data: {
        name: 'Team',
        email: 'team@hospital.test',
        passwordHash: await hashPassword('team-password'),
        role: 'PROCUREMENT_TEAM',
        status: 'ACTIVE',
      },
    });
    director = await login(DIRECTOR.email, DIRECTOR.password);
    team = await login('team@hospital.test', 'team-password');
  }, 60_000); // three bcrypt operations (cost 12) can be slow on a loaded machine
  afterEach(async () => {
    jest.restoreAllMocks();
    await prisma.settings.deleteMany();
    await prisma.thresholdOverride.deleteMany();
    await prisma.configurationLog.deleteMany();
  });
  afterAll(async () => {
    await app.close();
  });

  describe('configuration', () => {
    it('returns the defaults, the dataset range and the Reference Date in force', async () => {
      const res = await http().get('/api/settings').set('Cookie', director).expect(200);
      expect(res.body).toEqual({
        referenceDate: null,
        effectiveReferenceDate: '2025-01-10',
        datasetRange: { start: '2025-01-01', end: '2025-01-10' },
        abcThresholdA: 80,
        abcThresholdB: 95,
        urgencyFactor: 0.5,
        criticalAbcClasses: ['A', 'B'],
        lowTurnoverThreshold: 12,
      });
    });

    it('a change reclassifies Items: urgency factor 1 and class C counting makes the Syringe Critical', async () => {
      expect((await getItems()).byName('Syringe').urgencyLevel).toBe('ATTENTION');
      const res = await patch({ urgencyFactor: 1, criticalAbcClasses: ['C', 'A', 'B'] }).expect(200);
      expect(res.body).toMatchObject({ urgencyFactor: 1, criticalAbcClasses: ['A', 'B', 'C'] });
      expect((await getItems()).byName('Syringe').urgencyLevel).toBe('CRITICAL');
    });

    it('changing the ABC thresholds reclassifies Items', async () => {
      const before = await getItems();
      expect(before.body.portfolio.abcCounts).toEqual({ A: 1, B: 0, C: 4 });
      await patch({ abcThresholdA: 50, abcThresholdB: 99 }).expect(200);
      const after = await getItems();
      expect(after.body.config).toMatchObject({ abcThresholdA: 50, abcThresholdB: 99 });
      expect(after.body.portfolio.abcCounts).not.toEqual({ A: 1, B: 0, C: 4 });
      expect(after.byName('Syringe').abcClass).toBe('B');
    });

    it('changing the Low-Turnover threshold is applied', async () => {
      await patch({ lowTurnoverThreshold: 20 }).expect(200);
      expect((await getItems()).byName('Ventilator').lowTurnover).toBe(true);
    });

    it('changes the Reference Date, and null goes back to the dataset last date', async () => {
      const res = await patch({ referenceDate: '2025-01-05' }).expect(200);
      expect(res.body).toMatchObject({ referenceDate: '2025-01-05', effectiveReferenceDate: '2025-01-05' });
      const items = await getItems();
      expect(items.body.referenceDate).toBe('2025-01-05');
      expect(items.byName('Pump Set').state).toBeNull();

      await patch({ referenceDate: null }).expect(200);
      expect((await getItems()).body.referenceDate).toBe('2025-01-10');
    });

    it.each([
      ['A not below B', { abcThresholdA: 90, abcThresholdB: 90 }],
      ['A zero', { abcThresholdA: 0 }],
      ['B above 100', { abcThresholdB: 101 }],
      ['A above the current B', { abcThresholdA: 96 }],
      ['negative urgency factor', { urgencyFactor: -1 }],
      ['non-numeric urgency factor', { urgencyFactor: 'half' }],
      ['negative Low-Turnover threshold', { lowTurnoverThreshold: -1 }],
      ['unknown ABC class', { criticalAbcClasses: ['D'] }],
      ['no ABC class', { criticalAbcClasses: [] }],
      ['Reference Date before the dataset', { referenceDate: '2024-12-31' }],
      ['Reference Date after the dataset', { referenceDate: '2025-01-11' }],
      ['impossible Reference Date', { referenceDate: '2025-02-30' }],
      ['malformed Reference Date', { referenceDate: 'yesterday' }],
      ['unknown field', { foo: 1 }],
    ])('rejects %s with 400 and changes nothing', async (_name, body) => {
      await patch(body).expect(400);
      expect(await prisma.settings.count()).toBe(0);
      expect(await prisma.configurationLog.count()).toBe(0);
    });

    it('writes a log entry with the date, the User and old to new values', async () => {
      await patch({ urgencyFactor: 1, lowTurnoverThreshold: 20 }).expect(200);
      await patch({ urgencyFactor: 1 }).expect(200); // no change: not logged
      const res = await http().get('/api/settings/log').set('Cookie', director).expect(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0]).toMatchObject({ userName: DIRECTOR.name });
      expect(Date.now() - new Date(res.body[0].createdAt).getTime()).toBeLessThan(60_000);
      expect(res.body[0].changes).toEqual(
        expect.arrayContaining([
          { field: 'urgencyFactor', old: 0.5, new: 1 },
          { field: 'lowTurnoverThreshold', old: 12, new: 20 },
        ]),
      );
    });

    it('triggers a recalculation on every change, but not when nothing changed', async () => {
      const spy = jest.spyOn(recalculationModule, 'runRecalculation');
      await patch({ urgencyFactor: 1 }).expect(200);
      expect(spy).toHaveBeenCalledTimes(1);
      await patch({ urgencyFactor: 1 }).expect(200);
      expect(spy).toHaveBeenCalledTimes(1);
    });
  });

  describe('Threshold Overrides', () => {
    it('are applied to the indicators, listed, and cleared', async () => {
      const syringe = await itemId('Syringe');
      const ventilator = await itemId('Ventilator');
      const put = (id: number, body: object) =>
        http().put(`/api/settings/overrides/${id}`).set('Cookie', director).send(body);

      const res = await put(syringe, { minRequired: 150 }).expect(200);
      expect(res.body).toMatchObject({ itemId: syringe, name: 'Syringe', minRequired: 150, maxCapacity: null });
      await put(ventilator, { maxCapacity: 50 }).expect(200);

      const items = await getItems();
      expect(items.byName('Syringe').stockStatus).toBe('BELOW_MINIMUM');
      expect(items.byName('Syringe').urgencyLevel).toBe('CRITICAL');
      expect(items.byName('Ventilator').excessStockValue).toBe(19000);

      const list = await http().get('/api/settings/overrides').set('Cookie', director).expect(200);
      expect(list.body).toHaveLength(2);

      // Clearing one side keeps the other; clearing both removes the override.
      await put(syringe, { minRequired: null, maxCapacity: 300 }).expect(200);
      expect((await getItems()).byName('Syringe').stockStatus).not.toBe('BELOW_MINIMUM');
      await put(syringe, { maxCapacity: null }).expect(200);
      expect(await prisma.thresholdOverride.count({ where: { itemId: syringe } })).toBe(0);

      await http().delete(`/api/settings/overrides/${ventilator}`).set('Cookie', director).expect(204);
      expect((await getItems()).byName('Ventilator').excessStockValue).toBe(4000);
      expect(await prisma.thresholdOverride.count()).toBe(0);
    });

    it('logs each change and triggers a recalculation', async () => {
      const syringe = await itemId('Syringe');
      const spy = jest.spyOn(recalculationModule, 'runRecalculation');
      await http().put(`/api/settings/overrides/${syringe}`).set('Cookie', director).send({ minRequired: 150 }).expect(200);
      await http().delete(`/api/settings/overrides/${syringe}`).set('Cookie', director).expect(204);
      expect(spy).toHaveBeenCalledTimes(2);
      const log = await http().get('/api/settings/log').set('Cookie', director).expect(200);
      expect(log.body).toHaveLength(2);
      expect(log.body[1].changes[0]).toMatchObject({ old: null, new: 150 });
      expect(log.body[0].changes[0]).toMatchObject({ old: 150, new: null });
    });

    it('rejects bad numbers with 400 and unknown Items with 404', async () => {
      const syringe = await itemId('Syringe');
      const put = (id: number, body: object) =>
        http().put(`/api/settings/overrides/${id}`).set('Cookie', director).send(body);
      await put(syringe, { minRequired: -1 }).expect(400);
      await put(syringe, { maxCapacity: 'lots' }).expect(400);
      await put(syringe, { foo: 1 }).expect(400);
      await put(999999, { minRequired: 1 }).expect(404);
      await http().delete('/api/settings/overrides/999999').set('Cookie', director).expect(404);
      expect(await prisma.thresholdOverride.count()).toBe(0);
    });
  });

  describe('permissions', () => {
    it('needs a login (401)', async () => {
      await http().get('/api/settings').expect(401);
      await http().get('/api/settings/overrides').expect(401);
      await http().patch('/api/settings').send({}).expect(401);
    });

    it('the Team can read the configuration and overrides', async () => {
      await http().get('/api/settings').set('Cookie', team).expect(200);
      await http().get('/api/settings/overrides').set('Cookie', team).expect(200);
    });

    it('the Team gets 403 on every write and on the log, and nothing changes', async () => {
      const syringe = await itemId('Syringe');
      await patch({ urgencyFactor: 1 }, team).expect(403);
      await http().put(`/api/settings/overrides/${syringe}`).set('Cookie', team).send({ minRequired: 150 }).expect(403);
      await http().delete(`/api/settings/overrides/${syringe}`).set('Cookie', team).expect(403);
      await http().get('/api/settings/log').set('Cookie', team).expect(403);
      expect(await prisma.settings.count()).toBe(0);
      expect(await prisma.thresholdOverride.count()).toBe(0);
      expect(await prisma.configurationLog.count()).toBe(0);
    });
  });
});
