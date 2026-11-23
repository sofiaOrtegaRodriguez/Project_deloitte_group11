// A Removed User's name is shown as "Name (removed)" wherever it appears as an author (Alert comments, Alert
// history, Recommendation history, submitter and decider), and Restore brings the plain name back.
import type { INestApplication } from '@nestjs/common';
import * as path from 'node:path';
import request from 'supertest';
import { hashPassword } from '../src/auth/password';
import { runEtl } from '../src/etl/run-etl';
import { PrismaService } from '../src/prisma/prisma.service';
import { seedDirector } from '../src/users/director-seed';
import { createTestApp, DIRECTOR } from './app';
import { FIXTURES, resetDatabase } from './helpers';

const TEAM = { name: 'Nurse Ana', email: 'ana@hospital.test', password: 'ana-password-1' };

/** Every string value in a JSON body. */
function strings(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (value && typeof value === 'object') return Object.values(value).flatMap(strings);
  return [];
}

interface Person {
  id: number;
  name: string;
  removed: boolean;
}
interface Rec {
  id: number;
  status: string;
  itemName: string;
  createdBy: Person | null;
  submittedBy: Person | null;
  decidedBy: Person | null;
  history: { type: string; user: Person | null }[];
}
interface AlertBody {
  id: number;
  itemName: string;
  events: { type: string; user: { id: number; name: string } | null }[];
}

describe('Removed authors', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let director: string;
  let team: string;
  let teamId: number;
  let monitorAlertId: number;
  const http = () => request(app.getHttpServer());

  async function login(email: string, password: string): Promise<string> {
    const res = await http().post('/api/auth/login').send({ email, password }).expect(200);
    return (res.headers['set-cookie'] as unknown as string[])[0].split(';')[0];
  }
  const itemId = async (name: string) => (await prisma.item.findFirstOrThrow({ where: { name } })).id;
  const recs = async (): Promise<Rec[]> => (await http().get('/api/recommendations').set('Cookie', director).expect(200)).body;
  const alert = async (): Promise<AlertBody> => (await http().get(`/api/alerts/${monitorAlertId}`).set('Cookie', director).expect(200)).body;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    await resetDatabase(prisma);
    await seedDirector(prisma);
    await runEtl(prisma, path.join(FIXTURES, 'indicators'));
    teamId = (
      await prisma.user.create({
        data: { name: TEAM.name, email: TEAM.email, passwordHash: await hashPassword(TEAM.password), role: 'PROCUREMENT_TEAM', status: 'ACTIVE' },
      })
    ).id;
    director = await login(DIRECTOR.email, DIRECTOR.password);
    team = await login(TEAM.email, TEAM.password);

    // Alert: a comment and a status change by the Team member.
    const alerts = (await http().get('/api/alerts').set('Cookie', team).expect(200)).body as AlertBody[];
    monitorAlertId = alerts.find((a) => a.itemName === 'Monitor')!.id;
    await http().post(`/api/alerts/${monitorAlertId}/comments`).set('Cookie', team).send({ comment: 'On it' }).expect(201);
    await http().post(`/api/alerts/${monitorAlertId}/status`).set('Cookie', team).send({ status: 'VIEWED' }).expect(200);

    // Recommendation 1: created, edited, submitted by the Team member, rejected by the Director.
    const pump = await itemId('Pump Set');
    const first = (await http().post('/api/recommendations').set('Cookie', team).send({ itemId: pump, type: 'REPLENISH', quantity: 5 }).expect(201)).body as Rec;
    await http().patch(`/api/recommendations/${first.id}`).set('Cookie', team).send({ quantity: 6 }).expect(200);
    await http().post(`/api/recommendations/${first.id}/submit`).set('Cookie', team).expect(200);
    await http().post(`/api/recommendations/${first.id}/reject`).set('Cookie', director).send({ comment: 'No' }).expect(200);
    // Recommendation 2: created and discarded by the Team member.
    const second = (await http().post('/api/recommendations').set('Cookie', team).send({ itemId: pump, type: 'REPLENISH', quantity: 2 }).expect(201)).body as Rec;
    await http().post(`/api/recommendations/${second.id}/discard`).set('Cookie', team).send({ reason: 'Mistake' }).expect(200);
    // Recommendation 3: the Syringe auto-Draft goes stale, and the Team member updates it to current data.
    await http().patch('/api/settings').set('Cookie', director).send({ referenceDate: '2025-01-05' }).expect(200);
    const syringeDraft = (await recs()).find((r) => r.itemName === 'Syringe' && r.status === 'DRAFT')!;
    await http().post(`/api/recommendations/${syringeDraft.id}/update-to-current`).set('Cookie', team).expect(200);
  });
  afterAll(async () => {
    await app.close();
  });

  it('shows the plain name while the User is Active, on every surface', async () => {
    const all = await recs();
    expect(all.flatMap((r) => r.history).map((e) => e.type)).toEqual(
      expect.arrayContaining(['CREATED', 'EDITED', 'SUBMITTED', 'REJECTED', 'DISCARDED', 'UPDATED_TO_CURRENT']),
    );
    expect(strings(await alert())).toContain(TEAM.name);
    expect(strings(all)).toContain(TEAM.name);
    expect(strings([await alert(), all]).filter((s) => s.includes('(removed)'))).toEqual([]);
  });

  it('shows "Name (removed)" in Alert comments and history, and in Recommendation history, submitter and creator', async () => {
    await http().post(`/api/users/${teamId}/remove`).set('Cookie', director).expect(200);

    const detail = await alert();
    const authored = detail.events.filter((e) => e.user?.id === teamId);
    expect(authored.map((e) => e.type)).toEqual(expect.arrayContaining(['COMMENTED', 'STATUS_CHANGED']));
    for (const event of authored) expect(event.user?.name).toBe(`${TEAM.name} (removed)`);

    const all = await recs();
    const rejected = all.find((r) => r.status === 'REJECTED')!;
    expect(rejected.createdBy).toEqual({ id: teamId, name: `${TEAM.name} (removed)`, removed: true });
    expect(rejected.submittedBy).toEqual({ id: teamId, name: `${TEAM.name} (removed)`, removed: true });
    expect(rejected.decidedBy?.name).toBe(DIRECTOR.name); // the Director cannot be removed
    const types = new Set<string>();
    for (const rec of all) {
      for (const event of rec.history.filter((e) => e.user?.id === teamId)) {
        types.add(event.type);
        expect(event.user?.name).toBe(`${TEAM.name} (removed)`);
      }
    }
    expect([...types].sort()).toEqual(['CREATED', 'DISCARDED', 'EDITED', 'SUBMITTED', 'UPDATED_TO_CURRENT']);

    // Nothing anywhere shows the bare name (or an id in its place), also through the Item's own endpoints.
    const pumpRecs = (await http().get(`/api/items/${await itemId('Pump Set')}/recommendations`).set('Cookie', director).expect(200)).body;
    const itemAlerts = (await http().get(`/api/items/${await itemId('Monitor')}/alerts`).set('Cookie', director).expect(200)).body;
    expect(strings([detail, all, pumpRecs, itemAlerts]).filter((s) => s === TEAM.name)).toEqual([]);
    expect(strings([detail, all, pumpRecs, itemAlerts])).toContain(`${TEAM.name} (removed)`);
  });

  it('shows the plain name again after Restore', async () => {
    await http().post(`/api/users/${teamId}/restore`).set('Cookie', director).expect(200);
    const all = await recs();
    expect(strings([await alert(), all]).filter((s) => s.includes('(removed)'))).toEqual([]);
    expect(strings([await alert(), all])).toContain(TEAM.name);
    expect(all.find((r) => r.status === 'REJECTED')!.submittedBy).toEqual({ id: teamId, name: TEAM.name, removed: false });
  });
});
