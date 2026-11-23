// Purchase Planning and Recommendation Drafts against the test database, loaded from fixtures/indicators
// (same five Items as items.e2e-spec.ts: 101 Syringe, 102 Ventilator, 103 Monitor, 104 Gauze, 105 Pump Set).
//
// At the default Reference Date (2025-01-10):
//   Monitor  Critical:  stock 30, usage 3, Replenishment Time 2  -> Replenish 100 - (30 - 6) = 76 units, cost 76 x 5 = 380
//   Syringe  Attention: stock 60, usage 10, Replenishment Time 8 -> Replenish 200 - (60 - 80) = 220 units, cost 2200
//   Ventilator Excess:  Hold Purchases, frees (1000 - 800) x 20 = 4000
//   Gauze    Low-Turnover: Hold Purchases, frees its Stock Value 50 x 2 = 100
//   Pump Set Normal: no auto-Draft
import type { INestApplication } from '@nestjs/common';
import * as path from 'node:path';
import request from 'supertest';
import { hashPassword } from '../src/auth/password';
import { runEtl } from '../src/etl/run-etl';
import { PrismaService } from '../src/prisma/prisma.service';
import { runRecalculation } from '../src/recalculation/run-recalculation';
import { seedDirector } from '../src/users/director-seed';
import { createTestApp, DIRECTOR } from './app';
import { FIXTURES, resetDatabase } from './helpers';

const TEAM = { name: 'Team Member', email: 'team@hospital.test', password: 'team-password-1' };

interface Rec {
  id: number;
  type: string;
  status: string;
  itemId: number;
  itemName: string;
  quantity: number;
  estimatedCost: number;
  justification: string;
  figures: Record<string, number>;
  createdBy: { id: number; name: string; removed: boolean } | null;
  discardReason: string | null;
  history: { type: string; user: { name: string } | null; at: string; details: Record<string, unknown> | null }[];
}

describe('Purchase Planning and Recommendations', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let director: string;
  let team: string;
  const http = () => request(app.getHttpServer());

  async function login(email: string, password: string): Promise<string> {
    const res = await http().post('/api/auth/login').send({ email, password }).expect(200);
    return (res.headers['set-cookie'] as unknown as string[])[0].split(';')[0];
  }
  const itemId = async (name: string) => (await prisma.item.findFirstOrThrow({ where: { name } })).id;
  const list = async (query = ''): Promise<Rec[]> => (await http().get(`/api/recommendations${query}`).set('Cookie', director).expect(200)).body;
  const draftFor = async (name: string, type: string): Promise<Rec> => {
    const found = (await list(`?itemId=${await itemId(name)}&type=${type}&status=DRAFT`))[0];
    if (!found) throw new Error(`no ${type} Draft for ${name}`);
    return found;
  };

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
  });
  beforeEach(async () => {
    await resetDatabase(prisma);
    await seedDirector(prisma);
    await runEtl(prisma, path.join(FIXTURES, 'indicators'));
    await prisma.user.create({
      data: { name: TEAM.name, email: TEAM.email, passwordHash: await hashPassword(TEAM.password), role: 'PROCUREMENT_TEAM', status: 'ACTIVE' },
    });
    director = await login(DIRECTOR.email, DIRECTOR.password);
    team = await login(TEAM.email, TEAM.password);
  });
  afterAll(async () => {
    await app.close();
  });

  describe('ranking', () => {
    it('orders Items by Urgency Level then Priority Score and gives reasons', async () => {
      const res = await http().get('/api/planning/ranking').set('Cookie', team).expect(200);
      const items = res.body.items as { name: string; urgencyLevel: string; rank: number; reasons: string[]; suggestedQuantity: number; suggestedCost: number; freedCapital: number }[];
      expect(items.map((i) => i.urgencyLevel)).toEqual(['CRITICAL', 'ATTENTION', 'NORMAL', 'NORMAL', 'NORMAL']);
      expect(items.slice(0, 2).map((i) => i.name)).toEqual(['Monitor', 'Syringe']);
      expect(items[0].rank).toBe(1);
      expect(items[0].reasons).toEqual(expect.arrayContaining([expect.stringContaining('below the minimum of 40')]));
      expect(items[1].reasons[0]).toContain('Replenishment Time');
      expect(items[1].reasons).toContain('ABC Class C');
      expect(items[0]).toMatchObject({ suggestedQuantity: 76, suggestedCost: 380 });
      expect(items.find((i) => i.name === 'Ventilator')!.freedCapital).toBe(4000);
    });

    it('requires login', async () => {
      await http().get('/api/planning/ranking').expect(401);
    });
  });

  describe('auto-Drafts', () => {
    it('are created by recalculation for Critical/Attention (Replenish) and Excess/Low-Turnover (Hold Purchases)', async () => {
      await runRecalculation(prisma);
      const all = await list();
      expect(all.map((r) => `${r.itemName}:${r.type}`).sort()).toEqual([
        'Gauze:HOLD_PURCHASES',
        'Monitor:REPLENISH',
        'Syringe:REPLENISH',
        'Ventilator:HOLD_PURCHASES',
      ]);
      expect(all.every((r) => r.status === 'DRAFT' && r.createdBy === null)).toBe(true);

      const syringe = await draftFor('Syringe', 'REPLENISH');
      expect(syringe).toMatchObject({ quantity: 220, estimatedCost: 2200 });
      expect(syringe.justification).toContain('Replenishment Time');
      expect(syringe.justification).toContain('ABC Class');
      expect(syringe.figures).toMatchObject({ currentStock: 60, suggestedQuantity: 220 });
      expect((await draftFor('Monitor', 'REPLENISH')).quantity).toBe(76);
      const vent = await draftFor('Ventilator', 'HOLD_PURCHASES');
      expect(vent).toMatchObject({ quantity: 0, estimatedCost: 0 });
      expect(vent.figures.freedCapital).toBe(4000);
      expect((await draftFor('Gauze', 'HOLD_PURCHASES')).figures.freedCapital).toBe(100);
      expect(syringe.history).toHaveLength(1);
      expect(syringe.history[0]).toMatchObject({ type: 'CREATED', user: null });
    });

    it('never create a second open Draft per Item and type on a later recalculation', async () => {
      await runRecalculation(prisma);
      await runRecalculation(prisma);
      expect(await prisma.recommendation.count()).toBe(4);
    });

    it('create a new Draft once the previous one was Discarded and the Item still needs it', async () => {
      await runRecalculation(prisma);
      const first = await draftFor('Monitor', 'REPLENISH');
      await http().post(`/api/recommendations/${first.id}/discard`).set('Cookie', team).send({}).expect(200);
      await runRecalculation(prisma);
      const second = await draftFor('Monitor', 'REPLENISH');
      expect(second.id).not.toBe(first.id);
      expect(second.justification).toContain('1 (0 approved, 0 rejected, 1 discarded)');
    });

    it('the database allows at most one open Draft per Item and type', async () => {
      await runRecalculation(prisma);
      const existing = await prisma.recommendation.findFirstOrThrow({ where: { status: 'DRAFT' } });
      await expect(
        prisma.recommendation.create({
          data: {
            type: existing.type,
            itemId: existing.itemId,
            quantity: 1,
            estimatedCost: 1,
            justification: 'duplicate',
            figures: {},
          },
        }),
      ).rejects.toThrow();
    });
  });

  describe('manual creation', () => {
    it('lets the Procurement Team create a Replenish Recommendation for any Item with suggested defaults', async () => {
      const id = await itemId('Pump Set');
      const res = await http().post('/api/recommendations').set('Cookie', team).send({ itemId: id, type: 'REPLENISH' }).expect(201);
      const rec = res.body as Rec;
      // stock 10, usage 1, Replenishment Time 1 -> 20 - (10 - 1) = 11
      expect(rec).toMatchObject({ status: 'DRAFT', type: 'REPLENISH', quantity: 11, estimatedCost: 11, itemName: 'Pump Set' });
      expect(rec.createdBy).toMatchObject({ name: TEAM.name, removed: false });
      expect(rec.history).toHaveLength(1);
      expect(rec.history[0]).toMatchObject({ type: 'CREATED', user: { name: TEAM.name } });
    });

    it('accepts a quantity and justification, and the Director may create too', async () => {
      const id = await itemId('Pump Set');
      const rec = (await http().post('/api/recommendations').set('Cookie', director).send({ itemId: id, type: 'REPLENISH', quantity: 5, justification: 'Planned surgery' }).expect(201)).body as Rec;
      expect(rec).toMatchObject({ quantity: 5, estimatedCost: 5, justification: 'Planned surgery' });
    });

    it('rejects a second open Draft for the same Item and type, unknown Items and bad input', async () => {
      const id = await itemId('Pump Set');
      await http().post('/api/recommendations').set('Cookie', team).send({ itemId: id, type: 'REPLENISH' }).expect(201);
      await http().post('/api/recommendations').set('Cookie', team).send({ itemId: id, type: 'REPLENISH' }).expect(409);
      await http().post('/api/recommendations').set('Cookie', team).send({ itemId: id, type: 'HOLD_PURCHASES' }).expect(201);
      await http().post('/api/recommendations').set('Cookie', team).send({ itemId: 99999, type: 'REPLENISH' }).expect(404);
      await http().post('/api/recommendations').set('Cookie', team).send({ itemId: id, type: 'BUY' }).expect(400);
      await http().post('/api/recommendations').set('Cookie', team).send({ itemId: id, type: 'REPLENISH', quantity: -1 }).expect(400);
    });

    it('requires login', async () => {
      await http().post('/api/recommendations').send({ itemId: 1, type: 'REPLENISH' }).expect(401);
    });
  });

  describe('editing', () => {
    it('changes quantity (recomputing the cost) and justification of a Draft and records who and when', async () => {
      await runRecalculation(prisma);
      const draft = await draftFor('Syringe', 'REPLENISH');
      const res = await http().patch(`/api/recommendations/${draft.id}`).set('Cookie', team).send({ quantity: 100, justification: 'Bulk discount' }).expect(200);
      const rec = res.body as Rec;
      expect(rec).toMatchObject({ quantity: 100, estimatedCost: 1000, justification: 'Bulk discount', status: 'DRAFT' });
      expect(rec.history.map((h) => h.type)).toEqual(['CREATED', 'EDITED']);
      expect(rec.history[1].user).toMatchObject({ name: TEAM.name });
      expect(rec.history[1].details).toMatchObject({ quantity: { from: 220, to: 100 } });
      expect(Number.isNaN(Date.parse(rec.history[1].at))).toBe(false);
      // The figures it was created with are kept.
      expect(rec.figures.suggestedQuantity).toBe(220);
    });

    it('rejects empty edits, a quantity on Hold Purchases and edits of a Discarded Recommendation', async () => {
      await runRecalculation(prisma);
      const draft = await draftFor('Syringe', 'REPLENISH');
      await http().patch(`/api/recommendations/${draft.id}`).set('Cookie', team).send({}).expect(400);
      await http().patch(`/api/recommendations/${draft.id}`).set('Cookie', team).send({ status: 'APPROVED' }).expect(400);
      const hold = await draftFor('Gauze', 'HOLD_PURCHASES');
      await http().patch(`/api/recommendations/${hold.id}`).set('Cookie', team).send({ quantity: 3 }).expect(400);
      await http().patch(`/api/recommendations/${hold.id}`).set('Cookie', team).send({ justification: 'Stop buying' }).expect(200);
      await http().post(`/api/recommendations/${draft.id}/discard`).set('Cookie', team).send({}).expect(200);
      await http().patch(`/api/recommendations/${draft.id}`).set('Cookie', team).send({ quantity: 1 }).expect(409);
      await http().patch('/api/recommendations/99999').set('Cookie', team).send({ quantity: 1 }).expect(404);
    });
  });

  describe('Discard', () => {
    it('keeps the Recommendation, with the reason when given, and records who and when', async () => {
      await runRecalculation(prisma);
      const draft = await draftFor('Syringe', 'REPLENISH');
      const rec = (await http().post(`/api/recommendations/${draft.id}/discard`).set('Cookie', director).send({ reason: 'Ordered elsewhere' }).expect(200)).body as Rec;
      expect(rec).toMatchObject({ status: 'DISCARDED', discardReason: 'Ordered elsewhere' });
      expect(rec.history.map((h) => h.type)).toEqual(['CREATED', 'DISCARDED']);
      expect(rec.history[1].user).toMatchObject({ name: DIRECTOR.name });
      expect(await prisma.recommendation.count({ where: { id: draft.id } })).toBe(1);
    });

    it('works without a reason', async () => {
      await runRecalculation(prisma);
      const draft = await draftFor('Monitor', 'REPLENISH');
      const rec = (await http().post(`/api/recommendations/${draft.id}/discard`).set('Cookie', team).expect(200)).body as Rec;
      expect(rec).toMatchObject({ status: 'DISCARDED', discardReason: null });
    });

    it('is only possible from Draft', async () => {
      await runRecalculation(prisma);
      const draft = await draftFor('Monitor', 'REPLENISH');
      await http().post(`/api/recommendations/${draft.id}/discard`).set('Cookie', team).send({}).expect(200);
      await http().post(`/api/recommendations/${draft.id}/discard`).set('Cookie', team).send({}).expect(409);
      const syringe = await draftFor('Syringe', 'REPLENISH');
      await prisma.recommendation.update({ where: { id: syringe.id }, data: { status: 'PENDING_APPROVAL' } });
      await http().post(`/api/recommendations/${syringe.id}/discard`).set('Cookie', team).send({}).expect(409);
    });
  });

  describe('reading', () => {
    it("lists an Item's Recommendations with history, and shows removed authors as removed", async () => {
      const id = await itemId('Pump Set');
      const rec = (await http().post('/api/recommendations').set('Cookie', team).send({ itemId: id, type: 'REPLENISH' }).expect(201)).body as Rec;
      await prisma.user.update({ where: { email: TEAM.email }, data: { status: 'REMOVED' } });
      const res = await http().get(`/api/items/${id}/recommendations`).set('Cookie', director).expect(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].id).toBe(rec.id);
      expect(res.body[0].createdBy).toMatchObject({ name: `${TEAM.name} (removed)`, removed: true });
      expect(res.body[0].history[0].user.name).toBe(`${TEAM.name} (removed)`);
      await http().get(`/api/recommendations/${rec.id}`).set('Cookie', director).expect(200);
      await http().get('/api/recommendations/99999').set('Cookie', director).expect(404);
      await http().get(`/api/items/${id}/recommendations`).expect(401);
    });
  });
});
