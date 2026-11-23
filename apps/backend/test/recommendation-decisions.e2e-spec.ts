// Submit, Approve and Reject against the test database (fixtures/indicators, same five Items as recommendations.e2e-spec.ts).
// Monitor is Critical (Replenish Draft, 76 units), Syringe is Attention, Ventilator and Gauze get Hold Purchases Drafts.
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
const OTHER = { name: 'Other Member', email: 'other@hospital.test', password: 'other-password-1' };

interface Rec {
  id: number;
  type: string;
  status: string;
  itemName: string;
  priorityScore: number | null;
  submittedBy: { name: string } | null;
  submittedAt: string | null;
  decidedBy: { name: string } | null;
  decidedAt: string | null;
  decisionComment: string | null;
  approvedAt: string | null;
  indicatorSnapshot: { indicators: { urgencyLevel: string; state: { currentStock: number } }; quantity: number; figures: Record<string, number> } | null;
  history: { type: string; user: { name: string } | null; details: Record<string, unknown> | null }[];
}

jest.setTimeout(60000);

describe('Submit, Approve and Reject', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let director: string;
  let team: string;
  let other: string;
  const http = () => request(app.getHttpServer());

  async function login(email: string, password: string): Promise<string> {
    const res = await http().post('/api/auth/login').send({ email, password }).expect(200);
    return (res.headers['set-cookie'] as unknown as string[])[0].split(';')[0];
  }
  const draftFor = async (name: string, type: string): Promise<Rec> => {
    const item = await prisma.item.findFirstOrThrow({ where: { name } });
    const res = await http().get(`/api/recommendations?itemId=${item.id}&type=${type}&status=DRAFT`).set('Cookie', director).expect(200);
    return res.body[0];
  };
  const act = (id: number, action: string, cookie: string, body: object = {}) =>
    http().post(`/api/recommendations/${id}/${action}`).set('Cookie', cookie).send(body);
  const get = async (id: number): Promise<Rec> => (await http().get(`/api/recommendations/${id}`).set('Cookie', director).expect(200)).body;
  const alertOf = async (name: string) => {
    const item = await prisma.item.findFirstOrThrow({ where: { name } });
    return prisma.alert.findFirstOrThrow({ where: { itemId: item.id, status: { not: 'CLEARED' } }, include: { events: { orderBy: { id: 'asc' } } } });
  };

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
  });
  beforeEach(async () => {
    await resetDatabase(prisma);
    await seedDirector(prisma);
    await runEtl(prisma, path.join(FIXTURES, 'indicators'));
    for (const u of [TEAM, OTHER]) {
      await prisma.user.create({
        data: { name: u.name, email: u.email, passwordHash: await hashPassword(u.password), role: 'PROCUREMENT_TEAM', status: 'ACTIVE' },
      });
    }
    await runRecalculation(prisma);
    director = await login(DIRECTOR.email, DIRECTOR.password);
    team = await login(TEAM.email, TEAM.password);
    other = await login(OTHER.email, OTHER.password);
  });
  afterAll(async () => {
    await app.close();
  });

  it('requires login', async () => {
    await http().post('/api/recommendations/1/submit').expect(401);
    await http().post('/api/recommendations/1/approve').expect(401);
    await http().post('/api/recommendations/1/reject').send({ comment: 'x' }).expect(401);
    await http().get('/api/recommendations/top-pending').expect(401);
  });

  it('runs Draft -> Pending Approval -> Approved, recording who and when', async () => {
    const draft = await draftFor('Monitor', 'REPLENISH');
    const submitted = (await act(draft.id, 'submit', team).expect(200)).body as Rec;
    expect(submitted.status).toBe('PENDING_APPROVAL');
    expect(submitted.submittedBy?.name).toBe(TEAM.name);
    expect(submitted.submittedAt).not.toBeNull();
    expect(submitted.approvedAt).toBeNull();

    const approved = (await act(draft.id, 'approve', director).expect(200)).body as Rec;
    expect(approved.status).toBe('APPROVED');
    expect(approved.decidedBy?.name).toBe(DIRECTOR.name);
    expect(approved.decidedAt).not.toBeNull();
    expect(approved.approvedAt).toBe(approved.decidedAt);
    expect(approved.history.map((e) => e.type)).toEqual(['CREATED', 'SUBMITTED', 'APPROVED']);
    expect(approved.history[1].user?.name).toBe(TEAM.name);
  });

  it('Rejects with a comment, shown in the history', async () => {
    const draft = await draftFor('Syringe', 'REPLENISH');
    await act(draft.id, 'submit', team).expect(200);
    const rejected = (await act(draft.id, 'reject', director, { comment: '  Budget frozen  ' }).expect(200)).body as Rec;
    expect(rejected).toMatchObject({ status: 'REJECTED', decisionComment: 'Budget frozen', approvedAt: null });
    expect(rejected.history.map((e) => e.type)).toEqual(['CREATED', 'SUBMITTED', 'REJECTED']);
    expect(rejected.history[2].details).toEqual({ comment: 'Budget frozen' });
  });

  it('Reject without a comment is a 400 and changes nothing', async () => {
    const draft = await draftFor('Monitor', 'REPLENISH');
    await act(draft.id, 'submit', team).expect(200);
    await act(draft.id, 'reject', director).expect(400);
    await act(draft.id, 'reject', director, { comment: '   ' }).expect(400);
    expect((await get(draft.id)).status).toBe('PENDING_APPROVAL');
  });

  it('Approve and Reject are Director only (403 for the Procurement Team)', async () => {
    const draft = await draftFor('Monitor', 'REPLENISH');
    await act(draft.id, 'submit', team).expect(200);
    await act(draft.id, 'approve', team).expect(403);
    await act(draft.id, 'reject', team, { comment: 'no' }).expect(403);
    expect((await get(draft.id)).status).toBe('PENDING_APPROVAL');
  });

  it('answers 409 to invalid transitions', async () => {
    const draft = await draftFor('Monitor', 'REPLENISH');
    await act(draft.id, 'approve', director).expect(409); // Draft cannot be approved
    await act(draft.id, 'reject', director, { comment: 'no' }).expect(409);
    await act(draft.id, 'submit', team).expect(200);
    await act(draft.id, 'submit', team).expect(409); // already pending
    await http().patch(`/api/recommendations/${draft.id}`).set('Cookie', team).send({ quantity: 5 }).expect(409);
    await act(draft.id, 'approve', director).expect(200);
    await act(draft.id, 'approve', director).expect(409);
    await act(draft.id, 'reject', director, { comment: 'no' }).expect(409);
    await act(draft.id, 'submit', team).expect(409);

    const discarded = await draftFor('Syringe', 'REPLENISH');
    await act(discarded.id, 'discard', team).expect(200);
    await act(discarded.id, 'submit', team).expect(409);
    await act(99999, 'submit', team).expect(404);
  });

  it('freezes the Indicator Snapshot at Submit: later changes to the data or settings do not touch it', async () => {
    const draft = await draftFor('Monitor', 'REPLENISH');
    const submitted = (await act(draft.id, 'submit', team).expect(200)).body as Rec;
    const snap = submitted.indicatorSnapshot!;
    expect(snap.indicators).toMatchObject({ urgencyLevel: 'CRITICAL', state: { currentStock: 30 } });
    expect(snap.quantity).toBe(76);
    expect(snap.figures).toMatchObject({ currentStock: 30, suggestedQuantity: 76 });

    const monitor = await prisma.item.findFirstOrThrow({ where: { name: 'Monitor' } });
    await http().put(`/api/settings/overrides/${monitor.id}`).set('Cookie', director).send({ minRequired: 1 }).expect(200);
    await http().patch('/api/settings').set('Cookie', director).send({ urgencyFactor: 0.9 }).expect(200);
    await runRecalculation(prisma);

    const later = await get(draft.id);
    expect(later.indicatorSnapshot).toEqual(snap);
    expect((await act(draft.id, 'approve', director).expect(200)).body.indicatorSnapshot).toEqual(snap);
  });

  it('notifies only the submitter of the decision', async () => {
    const approvedDraft = await draftFor('Monitor', 'REPLENISH');
    const rejectedDraft = await draftFor('Syringe', 'REPLENISH');
    await act(approvedDraft.id, 'submit', team).expect(200);
    await act(rejectedDraft.id, 'submit', other).expect(200);
    await prisma.notification.deleteMany(); // ignore the Alert notifications

    await act(approvedDraft.id, 'approve', director).expect(200);
    const teamNotes = await http().get('/api/notifications').set('Cookie', team).expect(200);
    const forTeam = teamNotes.body.notifications as { type: string; message: string; recommendationId: number }[];
    expect(forTeam).toHaveLength(1);
    expect(forTeam[0]).toMatchObject({ type: 'RECOMMENDATION_DECISION', recommendationId: approvedDraft.id });
    expect(forTeam[0].message).toContain('approved');
    expect(await prisma.notification.count()).toBe(1);

    await act(rejectedDraft.id, 'reject', director, { comment: 'Too expensive' }).expect(200);
    const otherUser = await prisma.user.findFirstOrThrow({ where: { email: OTHER.email } });
    const forOther = await prisma.notification.findMany({ where: { userId: otherUser.id } });
    expect(forOther).toHaveLength(1);
    expect(forOther[0].message).toContain('rejected');
    expect(forOther[0].message).toContain('Too expensive');
    expect(await prisma.notification.count()).toBe(2);
    const directorUser = await prisma.user.findFirstOrThrow({ where: { email: DIRECTOR.email } });
    expect(await prisma.notification.count({ where: { userId: directorUser.id } })).toBe(0);
  });

  describe('Alert coupling', () => {
    it('Submit acknowledges the Item Alert and Approve resolves it, as system via Recommendation #N', async () => {
      const draft = await draftFor('Monitor', 'REPLENISH');
      expect((await alertOf('Monitor')).status).toBe('NEW');

      await act(draft.id, 'submit', team).expect(200);
      const acknowledged = await alertOf('Monitor');
      expect(acknowledged.status).toBe('ACKNOWLEDGED');
      expect(acknowledged.events.at(-1)).toMatchObject({ type: 'STATUS_CHANGED', toStatus: 'ACKNOWLEDGED', userId: null, note: `via Recommendation #${draft.id}` });

      await act(draft.id, 'approve', director).expect(200);
      const resolved = await alertOf('Monitor');
      expect(resolved.status).toBe('RESOLVED');
      expect(resolved.events.at(-1)).toMatchObject({ toStatus: 'RESOLVED', userId: null, note: `via Recommendation #${draft.id}` });
    });

    it('Reject leaves the Alert Acknowledged', async () => {
      const draft = await draftFor('Monitor', 'REPLENISH');
      await act(draft.id, 'submit', team).expect(200);
      await act(draft.id, 'reject', director, { comment: 'no' }).expect(200);
      expect((await alertOf('Monitor')).status).toBe('ACKNOWLEDGED');
    });

    it('does nothing when the Item has no open Alert or its Alert is Cleared', async () => {
      const draft = await draftFor('Monitor', 'REPLENISH');
      await prisma.alert.updateMany({ where: { itemId: (await prisma.item.findFirstOrThrow({ where: { name: 'Monitor' } })).id }, data: { status: 'CLEARED' } });
      await act(draft.id, 'submit', team).expect(200);
      await act(draft.id, 'approve', director).expect(200);
      const alerts = await prisma.alert.findMany({ where: { item: { name: 'Monitor' } }, include: { events: true } });
      expect(alerts).toHaveLength(1);
      expect(alerts[0].status).toBe('CLEARED');
      expect(alerts[0].events.filter((e) => e.type === 'STATUS_CHANGED')).toHaveLength(0);

      // Gauze is Low-Turnover only: no Alert at all, and Hold Purchases would not couple anyway.
      const pump = await prisma.item.findFirstOrThrow({ where: { name: 'Pump Set' } });
      expect(await prisma.alert.count({ where: { itemId: pump.id } })).toBe(0);
    });

    it('Hold Purchases has no Alert coupling', async () => {
      const ventilator = await prisma.item.findFirstOrThrow({ where: { name: 'Ventilator' } });
      const alert = await prisma.alert.create({ data: { itemId: ventilator.id, level: 'ATTENTION', status: 'NEW' } });
      const draft = await draftFor('Ventilator', 'HOLD_PURCHASES');
      await act(draft.id, 'submit', team).expect(200);
      expect((await prisma.alert.findUniqueOrThrow({ where: { id: alert.id } })).status).toBe('NEW');
      await act(draft.id, 'approve', director).expect(200);
      expect((await prisma.alert.findUniqueOrThrow({ where: { id: alert.id } })).status).toBe('NEW');
      expect(await prisma.alertEvent.count({ where: { alertId: alert.id } })).toBe(0);
    });
  });

  describe('top pending', () => {
    it('lists the Pending Approval Recommendations by Priority Score, highest first, at most the limit', async () => {
      for (const [name, type] of [['Monitor', 'REPLENISH'], ['Syringe', 'REPLENISH'], ['Ventilator', 'HOLD_PURCHASES'], ['Gauze', 'HOLD_PURCHASES']]) {
        await act((await draftFor(name, type)).id, 'submit', team).expect(200);
      }
      const all = (await http().get('/api/recommendations/top-pending').set('Cookie', team).expect(200)).body as Rec[];
      expect(all).toHaveLength(4);
      const scores = all.map((r) => r.priorityScore ?? -1);
      expect(scores).toEqual([...scores].sort((a, b) => b - a));
      expect(all.every((r) => r.status === 'PENDING_APPROVAL')).toBe(true);

      const two = (await http().get('/api/recommendations/top-pending?limit=2').set('Cookie', team).expect(200)).body as Rec[];
      expect(two.map((r) => r.id)).toEqual(all.slice(0, 2).map((r) => r.id));

      await act(all[0].id, 'approve', director).expect(200);
      const after = (await http().get('/api/recommendations/top-pending').set('Cookie', team).expect(200)).body as Rec[];
      expect(after.map((r) => r.id)).toEqual(all.slice(1).map((r) => r.id));
    });

    it('returns an empty list when nothing is pending', async () => {
      const res = await http().get('/api/recommendations/top-pending').set('Cookie', team).expect(200);
      expect(res.body).toEqual([]);
    });
  });
});
