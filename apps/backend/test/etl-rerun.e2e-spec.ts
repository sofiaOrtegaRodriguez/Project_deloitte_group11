// Re-running the ETL: source tables are replaced, people's work is kept, and everything derived is recalculated.
//
// Fixture: fixtures/indicators (101 Syringe, 102 Ventilator, 103 Monitor, 104 Gauze, 105 Pump Set), with the
// Reference Date set to 2025-01-08 by the Director. The second run uses a modified copy of the fixture:
//   - Monitor's Snapshot now has stock 90 (was 30, below its minimum of 40): it becomes Normal, so its Alert is Cleared.
//   - Syringe's usage doubles (10 -> 20): it becomes Critical (Alert Escalated) and its Draft becomes a Stale Draft.
//   - Pump Set disappears from the dataset: the Item and what people did on it must survive.
//   - Vendor V001 is renamed: source tables really are replaced.
import type { INestApplication } from '@nestjs/common';
import * as fs from 'node:fs';
import * as path from 'node:path';
import request from 'supertest';
import { runEtl } from '../src/etl/run-etl';
import { PrismaService } from '../src/prisma/prisma.service';
import { seedDirector } from '../src/users/director-seed';
import { createTestApp, DIRECTOR } from './app';
import { copyFixture, FIXTURES, resetDatabase } from './helpers';

const TEAM = { name: 'Team Member', email: 'team@hospital.test', password: 'team-password-1' };

describe('ETL re-run', () => {
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
  const draftFor = async (name: string, type: string) =>
    prisma.recommendation.findFirstOrThrow({ where: { itemId: await itemId(name), type: type as 'REPLENISH', status: 'DRAFT' } });

  /** Everything the ETL must not touch, read straight from the database. */
  async function applicationState() {
    return {
      users: await prisma.user.findMany({ orderBy: { id: 'asc' } }),
      settings: await prisma.settings.findMany(),
      overrides: await prisma.thresholdOverride.findMany({ orderBy: { id: 'asc' } }),
      configurationLog: await prisma.configurationLog.findMany({ orderBy: { id: 'asc' } }),
      userManagementLog: await prisma.userManagementLogEntry.findMany({ orderBy: { id: 'asc' } }),
      alerts: await prisma.alert.findMany({ orderBy: { id: 'asc' } }),
      alertEvents: await prisma.alertEvent.findMany({ orderBy: { id: 'asc' } }),
      recommendations: await prisma.recommendation.findMany({ orderBy: { id: 'asc' } }),
      recommendationEvents: await prisma.recommendationEvent.findMany({ orderBy: { id: 'asc' } }),
      notifications: await prisma.notification.findMany({ orderBy: { id: 'asc' } }),
      items: await prisma.item.findMany({ orderBy: { id: 'asc' }, select: { id: true, sourceItemId: true, name: true } }),
    };
  }

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
  });
  afterAll(async () => {
    await app.close();
  });

  it('keeps all application data, replaces source data and recalculates everything', async () => {
    await resetDatabase(prisma);
    await seedDirector(prisma);
    await runEtl(prisma, path.join(FIXTURES, 'indicators'));
    director = await login(DIRECTOR.email, DIRECTOR.password);

    // Users: the Director, an Active Team member, a Pending request and a Removed User (User Management Log entries).
    await http().post('/api/auth/register').send({ name: TEAM.name, email: TEAM.email, password: TEAM.password }).expect(201);
    await http().post('/api/auth/register').send({ name: 'Pending Pat', email: 'pat@hospital.test', password: 'pat-password-1' }).expect(201);
    await http().post('/api/auth/register').send({ name: 'Leaver Lee', email: 'lee@hospital.test', password: 'lee-password-1' }).expect(201);
    const idOf = async (email: string) => (await prisma.user.findFirstOrThrow({ where: { email } })).id;
    await http().post(`/api/users/${await idOf(TEAM.email)}/approve`).set('Cookie', director).expect(200);
    await http().post(`/api/users/${await idOf('lee@hospital.test')}/approve`).set('Cookie', director).expect(200);
    await http().post(`/api/users/${await idOf('lee@hospital.test')}/remove`).set('Cookie', director).expect(200);
    team = await login(TEAM.email, TEAM.password);

    // Settings and configuration: Reference Date, a changed setting, Threshold Overrides (one on an Item that will vanish).
    await http().patch('/api/settings').set('Cookie', director).send({ referenceDate: '2025-01-08', lowTurnoverThreshold: 10, criticalAbcClasses: ['A', 'B', 'C'] }).expect(200);
    await http().put(`/api/settings/overrides/${await itemId('Ventilator')}`).set('Cookie', director).send({ maxCapacity: 900 }).expect(200);
    await http().put(`/api/settings/overrides/${await itemId('Pump Set')}`).set('Cookie', director).send({ minRequired: 2 }).expect(200);

    // Alerts with comments and a status change.
    const alerts = (await http().get('/api/alerts').set('Cookie', team).expect(200)).body as { id: number; itemName: string }[];
    const monitorAlert = alerts.find((a) => a.itemName === 'Monitor')!;
    expect(monitorAlert).toBeDefined();
    await http().post(`/api/alerts/${monitorAlert.id}/comments`).set('Cookie', team).send({ comment: 'Calling the vendor' }).expect(201);
    await http().post(`/api/alerts/${monitorAlert.id}/status`).set('Cookie', team).send({ status: 'ACKNOWLEDGED' }).expect(200);

    // Recommendations: the auto-Drafts, a manual one on the Item that will vanish, one Approved, one Discarded.
    const manual = (await http().post('/api/recommendations').set('Cookie', team).send({ itemId: await itemId('Pump Set'), type: 'REPLENISH', quantity: 5 }).expect(201)).body as { id: number };
    const hold = await draftFor('Ventilator', 'HOLD_PURCHASES');
    await http().post(`/api/recommendations/${hold.id}/submit`).set('Cookie', team).expect(200);
    await http().post(`/api/recommendations/${hold.id}/approve`).set('Cookie', director).expect(200);
    const gauze = await draftFor('Gauze', 'HOLD_PURCHASES');
    await http().post(`/api/recommendations/${gauze.id}/discard`).set('Cookie', team).send({ reason: 'Not now' }).expect(200);
    const syringeDraft = await draftFor('Syringe', 'REPLENISH');
    expect(syringeDraft.staleSince).toBeNull();
    expect(await prisma.notification.count()).toBeGreaterThan(0);

    const before = await applicationState();
    const sourceBefore = {
      snapshots: await prisma.snapshot.count(),
      vendor: await prisma.vendor.findUniqueOrThrow({ where: { code: 'V001' } }),
    };
    expect(before.users).toHaveLength(4);
    expect(before.overrides).toHaveLength(2);
    expect(before.configurationLog.length).toBeGreaterThanOrEqual(3);
    expect(before.userManagementLog.length).toBe(3);

    // Second run, from a modified copy of the dataset.
    const dir = copyFixture(path.join(FIXTURES, 'indicators'));
    const inventory = path.join(dir, 'inventory_data.csv');
    const lines = fs
      .readFileSync(inventory, 'utf8')
      .split('\n')
      .filter((line) => line !== '' && !line.includes(',Pump Set,'))
      .map((line) =>
        line.startsWith('2025-01-04,103,') ? line.replace(',Monitor,30,', ',Monitor,90,') : line.startsWith('2025-01-06,101,') ? line.replace(',10,10,8,', ',10,20,8,') : line,
      );
    fs.writeFileSync(inventory, lines.join('\n') + '\n');
    const vendors = path.join(dir, 'vendor_data.csv');
    fs.writeFileSync(vendors, fs.readFileSync(vendors, 'utf8').replace('MedSupplies Inc.', 'Renamed Supplies'));
    const summary = await runEtl(prisma, dir);

    // Source tables were replaced.
    expect(await prisma.snapshot.count()).toBe(sourceBefore.snapshots - 1);
    expect((await prisma.vendor.findUniqueOrThrow({ where: { code: 'V001' } })).name).toBe('Renamed Supplies');
    expect(sourceBefore.vendor.name).toBe('MedSupplies Inc.');
    expect(summary.itemsCreated).toBe(0);

    const after = await applicationState();

    // Untouched: equal, row by row.
    expect(after.users).toEqual(before.users);
    expect(after.settings).toEqual(before.settings);
    expect(after.overrides).toEqual(before.overrides);
    expect(after.configurationLog).toEqual(before.configurationLog);
    expect(after.userManagementLog).toEqual(before.userManagementLog);
    // Item internal ids are stable, and the vanished Item is still there.
    expect(after.items).toEqual(before.items);

    // Alerts, Recommendations, history and notifications: everything created before is still there, same ids.
    // The recalculation may add to history (and change derived fields), never remove or rewrite what people did.
    const idsOf = <T extends { id: number }>(rows: T[]) => rows.map((r) => r.id);
    expect(idsOf(after.alerts)).toEqual(expect.arrayContaining(idsOf(before.alerts)));
    for (const prior of before.alertEvents) {
      expect(after.alertEvents).toContainEqual(prior);
    }
    for (const prior of before.notifications) {
      expect(after.notifications).toContainEqual(prior);
    }
    expect(idsOf(after.recommendations)).toEqual(expect.arrayContaining(idsOf(before.recommendations)));
    for (const prior of before.recommendationEvents) {
      expect(after.recommendationEvents).toContainEqual(prior);
    }
    // Decided and discarded Recommendations are completely unchanged; the manual Draft keeps who and what it was.
    for (const prior of before.recommendations.filter((r) => r.status !== 'DRAFT')) {
      expect(after.recommendations.find((r) => r.id === prior.id)).toEqual(prior);
    }
    const manualAfter = after.recommendations.find((r) => r.id === manual.id)!;
    expect(manualAfter).toMatchObject({ status: 'DRAFT', createdById: await idOf(TEAM.email), itemId: await itemId('Pump Set') });
    expect(manualAfter.quantity.toNumber()).toBe(5);
    // The comment and the status change are still on the Monitor Alert's history.
    expect(after.alertEvents.filter((e) => e.alertId === monitorAlert.id && e.comment === 'Calling the vendor')).toHaveLength(1);

    // The full recalculation ran: Alert sync ...
    const monitorAlertAfter = after.alerts.find((a) => a.id === monitorAlert.id)!;
    expect(monitorAlertAfter.status).toBe('CLEARED'); // Monitor is Normal now
    const syringeAlert = after.alerts.find((a) => a.itemId === before.items.find((i) => i.name === 'Syringe')!.id && a.status !== 'CLEARED')!;
    expect(syringeAlert.level).toBe('CRITICAL');
    expect(after.alertEvents.some((e) => e.alertId === syringeAlert.id && e.type === 'ESCALATED')).toBe(true);
    // ... Stale Draft detection (the Syringe Draft was made with the old usage) ...
    const syringeAfter = await prisma.recommendation.findUniqueOrThrow({ where: { id: syringeDraft.id } });
    expect(syringeAfter.status).toBe('DRAFT');
    expect(syringeAfter.staleSince).not.toBeNull();
    // ... and the CLI summary reports it.
    expect(summary.recalculation).toMatchObject({ referenceDate: '2025-01-08', critical: 1, attention: 0 });
    expect(summary.recalculation.staleDrafts).toBeGreaterThanOrEqual(1);
    expect(summary.recalculation.openAlerts).toBe(after.alerts.filter((a) => a.status !== 'CLEARED').length);

    // The people's work is still readable through the API after the re-run.
    const recs = (await http().get('/api/recommendations').set('Cookie', director).expect(200)).body as { id: number }[];
    expect(recs.map((r) => r.id)).toEqual(expect.arrayContaining(idsOf(before.recommendations)));
    const overrides = (await http().get('/api/settings/overrides').set('Cookie', director).expect(200)).body as unknown[];
    expect(overrides).toHaveLength(2);
  });

  it('an Item with no Snapshots after a re-run does not break the recalculation, and a third run is stable', async () => {
    const dir = copyFixture(path.join(FIXTURES, 'indicators'));
    const inventory = path.join(dir, 'inventory_data.csv');
    const lines = fs.readFileSync(inventory, 'utf8').split('\n').filter((l) => l !== '' && !l.includes(',Pump Set,'));
    fs.writeFileSync(inventory, lines.join('\n') + '\n');
    const first = await runEtl(prisma, dir);
    const state = await applicationState();
    const second = await runEtl(prisma, dir);
    expect(second.recalculation).toEqual(first.recalculation);
    expect(second.itemsCreated).toBe(0);
    expect(await applicationState()).toEqual(state);
  });
});
