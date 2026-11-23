// Stale Draft detection against the test database (fixtures/indicators, see recommendations.e2e-spec.ts).
// Changes are driven through the Threshold Override and settings endpoints, which recalculate.
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
  status: string;
  quantity: number;
  estimatedCost: number;
  justification: string;
  figures: Record<string, number>;
  stale: boolean;
  staleSince: string | null;
  oldVsCurrent: { field: string; old: unknown; current: unknown }[];
  history: { type: string; user: { name: string } | null }[];
}

describe('Stale Drafts', () => {
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
  const get = async (id: number): Promise<Rec> => (await http().get(`/api/recommendations/${id}`).set('Cookie', director).expect(200)).body;
  const autoDraft = async (name: string, type: string): Promise<Rec> => {
    const row = await prisma.recommendation.findFirstOrThrow({ where: { itemId: await itemId(name), type: type as 'REPLENISH', status: 'DRAFT' } });
    return get(row.id);
  };
  const override = async (name: string, body: object) =>
    http().put(`/api/settings/overrides/${await itemId(name)}`).set('Cookie', director).send(body).expect(200);
  const staleNotifications = (recommendationId: number) =>
    prisma.notification.findMany({ where: { type: 'DRAFT_STALE', recommendationId }, orderBy: { userId: 'asc' } });

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
  }, 60_000);
  beforeEach(async () => {
    await resetDatabase(prisma);
    await seedDirector(prisma);
    await runEtl(prisma, path.join(FIXTURES, 'indicators'));
    await prisma.user.create({
      data: { name: TEAM.name, email: TEAM.email, passwordHash: await hashPassword(TEAM.password), role: 'PROCUREMENT_TEAM', status: 'ACTIVE' },
    });
    director = await login(DIRECTOR.email, DIRECTOR.password);
    team = await login(TEAM.email, TEAM.password);
  }, 60_000);
  afterAll(async () => {
    await app.close();
  });

  it('does not mark Drafts stale (and sends nothing) when nothing changed', async () => {
    await runRecalculation(prisma);
    await runRecalculation(prisma);
    const rows = await prisma.recommendation.findMany();
    expect(rows).toHaveLength(4);
    expect(rows.every((r) => r.staleSince === null && r.currentFigures === null)).toBe(true);
    expect(await prisma.notification.count({ where: { type: 'DRAFT_STALE' } })).toBe(0);
    const rec = await autoDraft('Monitor', 'REPLENISH');
    expect(rec).toMatchObject({ stale: false, staleSince: null, oldVsCurrent: [] });
  });

  it('marks a Draft stale when the indicators change, and exposes old vs current', async () => {
    await runRecalculation(prisma);
    const before = await autoDraft('Monitor', 'REPLENISH');
    expect(before.quantity).toBe(76);
    await override('Monitor', { maxCapacity: 150 });

    const rec = await autoDraft('Monitor', 'REPLENISH');
    expect(rec.stale).toBe(true);
    expect(rec.staleSince).not.toBeNull();
    expect(rec.oldVsCurrent).toEqual(
      expect.arrayContaining([
        { field: 'maxCapacity', old: 100, current: 150 },
        { field: 'suggestedQuantity', old: 76, current: 126 },
      ]),
    );
    // The Draft itself is not silently rewritten.
    expect(rec.quantity).toBe(76);
    expect(rec.figures.maxCapacity).toBe(100);
    // Other Drafts are untouched.
    expect((await autoDraft('Syringe', 'REPLENISH')).stale).toBe(false);
  });

  it('notifies once per staleness episode, not on every recalculation', async () => {
    await runRecalculation(prisma);
    const rec = await autoDraft('Monitor', 'REPLENISH');
    await override('Monitor', { maxCapacity: 150 });
    await runRecalculation(prisma);
    await runRecalculation(prisma);
    expect(await staleNotifications(rec.id)).toHaveLength(2); // director + team, one each

    // A new episode (stale -> fresh -> stale) notifies again.
    await http().delete(`/api/settings/overrides/${await itemId('Monitor')}`).set('Cookie', director).expect(204);
    expect((await get(rec.id)).stale).toBe(false);
    await override('Monitor', { maxCapacity: 160 });
    expect(await staleNotifications(rec.id)).toHaveLength(4);
  });

  it('notifies every Active User for a system Draft', async () => {
    await runRecalculation(prisma);
    const rec = await autoDraft('Monitor', 'REPLENISH');
    await override('Monitor', { maxCapacity: 150 });
    const notes = await staleNotifications(rec.id);
    const users = await prisma.user.findMany({ where: { status: 'ACTIVE' } });
    expect(notes.map((n) => n.userId).sort()).toEqual(users.map((u) => u.id).sort());
    expect(notes[0]).toMatchObject({ itemId: await itemId('Monitor'), type: 'DRAFT_STALE' });
  });

  it('notifies only the owner for a manual Draft', async () => {
    const pump = await itemId('Pump Set');
    const created = await http().post('/api/recommendations').set('Cookie', team).send({ itemId: pump, type: 'REPLENISH', quantity: 10 }).expect(201);
    await override('Pump Set', { maxCapacity: 5000 });
    expect((await get(created.body.id)).stale).toBe(true);
    const notes = await staleNotifications(created.body.id);
    const teamUser = await prisma.user.findFirstOrThrow({ where: { email: TEAM.email } });
    expect(notes.map((n) => n.userId)).toEqual([teamUser.id]);
  });

  it('keeps a manual edit and only sets the stale marker', async () => {
    await runRecalculation(prisma);
    const rec = await autoDraft('Monitor', 'REPLENISH');
    await http().patch(`/api/recommendations/${rec.id}`).set('Cookie', team).send({ quantity: 90, justification: 'My reasons' }).expect(200);
    await override('Monitor', { maxCapacity: 150 });
    expect(await get(rec.id)).toMatchObject({ stale: true, quantity: 90, justification: 'My reasons' });
  });

  it('update-to-current refreshes the figures, clears the marker and records history', async () => {
    await runRecalculation(prisma);
    const rec = await autoDraft('Monitor', 'REPLENISH');
    await override('Monitor', { maxCapacity: 150 });

    const res = await http().post(`/api/recommendations/${rec.id}/update-to-current`).set('Cookie', team).expect(200);
    expect(res.body).toMatchObject({ stale: false, staleSince: null, oldVsCurrent: [], quantity: 126, estimatedCost: 630 });
    expect(res.body.figures).toMatchObject({ maxCapacity: 150, suggestedQuantity: 126 });
    expect(res.body.justification).toContain('126 units');
    expect(res.body.history.map((h: { type: string }) => h.type)).toEqual(['CREATED', 'UPDATED_TO_CURRENT']);
    expect(res.body.history[1].user.name).toBe(TEAM.name);

    // Not stale any more, and recalculating does not make it stale again.
    await runRecalculation(prisma);
    expect((await get(rec.id)).stale).toBe(false);
    // A second update is a conflict.
    await http().post(`/api/recommendations/${rec.id}/update-to-current`).set('Cookie', team).expect(409);
  });

  it('update-to-current answers 409 for a Draft that is not stale, and 404 for unknown ones', async () => {
    await runRecalculation(prisma);
    const rec = await autoDraft('Monitor', 'REPLENISH');
    await http().post(`/api/recommendations/${rec.id}/update-to-current`).set('Cookie', team).expect(409);
    await http().post('/api/recommendations/99999/update-to-current').set('Cookie', team).expect(404);
  });

  it('requires login for update-to-current', async () => {
    await http().post('/api/recommendations/1/update-to-current').expect(401);
  });

  it('does not mark Pending Approval Drafts stale', async () => {
    await runRecalculation(prisma);
    const rec = await autoDraft('Monitor', 'REPLENISH');
    await prisma.recommendation.update({ where: { id: rec.id }, data: { status: 'PENDING_APPROVAL' } });
    await override('Monitor', { maxCapacity: 150 });
    expect(await get(rec.id)).toMatchObject({ status: 'PENDING_APPROVAL', stale: false });
    expect(await staleNotifications(rec.id)).toHaveLength(0);
  });

  it('clears the marker by itself when the figures match again', async () => {
    await runRecalculation(prisma);
    const rec = await autoDraft('Monitor', 'REPLENISH');
    await override('Monitor', { maxCapacity: 150 });
    expect((await get(rec.id)).stale).toBe(true);
    await http().delete(`/api/settings/overrides/${await itemId('Monitor')}`).set('Cookie', director).expect(204);
    expect(await get(rec.id)).toMatchObject({ stale: false, staleSince: null, oldVsCurrent: [] });
    const row = await prisma.recommendation.findUniqueOrThrow({ where: { id: rec.id } });
    expect(row.staleNotifiedAt).toBeNull();
  });

  it('never deletes Drafts, even when the Item stops needing them', async () => {
    await runRecalculation(prisma);
    const before = await prisma.recommendation.count();
    await override('Monitor', { minRequired: 1, maxCapacity: 100000 });
    await override('Syringe', { minRequired: 1, maxCapacity: 100000 });
    await override('Ventilator', { maxCapacity: 100000 });
    await runRecalculation(prisma);
    expect(await prisma.recommendation.count()).toBe(before);
    expect(await prisma.recommendation.count({ where: { status: 'DRAFT' } })).toBe(before);
  });
});
