// Replenishment in Progress (ticket 17) through the API, with the injectable clock for Reminders and the settings
// PATCH to move the Reference Date. Dataset: fixtures/indicators; the tests start with the Reference Date at 2025-01-06 (the data runs to 2025-01-10).
// Monitor is Critical with Replenishment Time 2 days, so an approval on 2025-01-06 expects delivery on 2025-01-08.
// Syringe is Attention, Ventilator and Gauze get Hold Purchases Drafts.
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as path from 'node:path';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { hashPassword } from '../src/auth/password';
import { CLOCK, FakeClock } from '../src/clock/clock';
import { runEtl } from '../src/etl/run-etl';
import { PrismaService } from '../src/prisma/prisma.service';
import { runRecalculation } from '../src/recalculation/run-recalculation';
import { RemindersService } from '../src/reminders/reminders';
import { hasReplenishmentInProgress } from '../src/reminders/replenishment';
import { seedDirector } from '../src/users/director-seed';
import { DIRECTOR } from './app';
import { FIXTURES, resetDatabase } from './helpers';

const HOUR = 60 * 60 * 1000;
const OVERDUE = 'expected delivery overdue';

interface Rec {
  id: number;
  status: string;
  approvedAt: string | null;
  inProgress: boolean;
  expectedDeliveryDate: string | null;
  overdue: boolean;
}

jest.setTimeout(60000);

describe('Replenishment in Progress', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let reminders: RemindersService;
  let director: string;
  const clock = new FakeClock('2026-03-01T10:00:00Z');
  const http = () => request(app.getHttpServer());

  const itemId = async (name: string) => (await prisma.item.findFirstOrThrow({ where: { name } })).id;
  const draftFor = async (name: string, type: string): Promise<Rec> => {
    const id = await itemId(name);
    const res = await http().get(`/api/recommendations?itemId=${id}&type=${type}&status=DRAFT`).set('Cookie', director).expect(200);
    return res.body[0];
  };
  const act = (id: number, action: string) => http().post(`/api/recommendations/${id}/${action}`).set('Cookie', director).send({});
  const get = async (id: number): Promise<Rec> => (await http().get(`/api/recommendations/${id}`).set('Cookie', director).expect(200)).body;
  /** Submit + Approve the Item's auto-Draft. */
  const approveFor = async (name: string, type = 'REPLENISH'): Promise<Rec> => {
    const draft = await draftFor(name, type);
    await act(draft.id, 'submit').expect(200);
    return (await act(draft.id, 'approve').expect(200)).body;
  };
  const setReferenceDate = (referenceDate: string | null) =>
    http().patch('/api/settings').set('Cookie', director).send({ referenceDate }).expect(200);
  const alertOf = async (name: string) =>
    prisma.alert.findFirstOrThrow({ where: { itemId: await itemId(name), status: { not: 'CLEARED' } }, include: { events: { orderBy: { id: 'asc' } } } });
  const overdueEvents = async (name: string) => (await alertOf(name)).events.filter((e) => e.type === 'REOPENED' && e.note === OVERDUE);
  const wait = (hours: number) => {
    clock.advance(hours * HOUR);
    return reminders.tick();
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(CLOCK).useValue(clock).compile();
    app = configureApp(moduleRef.createNestApplication());
    await app.init();
    prisma = app.get(PrismaService);
    reminders = app.get(RemindersService);
  }, 60_000);

  beforeEach(async () => {
    delete process.env.ALERT_REPEAT_HOURS;
    clock.set(new Date('2026-03-01T10:00:00Z'));
    await resetDatabase(prisma);
    await seedDirector(prisma);
    await runEtl(prisma, path.join(FIXTURES, 'indicators'));
    await prisma.user.create({
      data: { name: 'Team', email: 'team@hospital.test', passwordHash: await hashPassword('team-password'), role: 'PROCUREMENT_TEAM', status: 'ACTIVE' },
    });
    const start = new Date('2025-01-06T00:00:00Z');
    await prisma.settings.upsert({ where: { id: 1 }, create: { id: 1, referenceDate: start }, update: { referenceDate: start } });
    await runRecalculation(prisma);
    const login = await http().post('/api/auth/login').send({ email: DIRECTOR.email, password: DIRECTOR.password }).expect(200);
    director = (login.headers['set-cookie'] as unknown as string[])[0].split(';')[0];
    await reminders.tick(); // baseline
  });

  afterAll(async () => {
    await app.close();
  });

  it('Approve records the Approval Reference Date and Replenishment Time, and the Item has a Replenishment in Progress', async () => {
    const approved = await approveFor('Monitor');
    expect(approved).toMatchObject({ status: 'APPROVED', inProgress: true, expectedDeliveryDate: '2025-01-08', overdue: false });
    const row = await prisma.recommendation.findUniqueOrThrow({ where: { id: approved.id } });
    expect(row.approvalReferenceDate?.toISOString().slice(0, 10)).toBe('2025-01-06');
    expect(row.replenishmentTimeDays?.toNumber()).toBe(2);
    expect(await hasReplenishmentInProgress(prisma, await itemId('Monitor'), '2025-01-06')).toBe(true);
    // the list endpoint reports it too
    const list = await http().get('/api/recommendations?status=APPROVED').set('Cookie', director).expect(200);
    expect(list.body[0]).toMatchObject({ inProgress: true, expectedDeliveryDate: '2025-01-08' });
  });

  it('a Reminder round skips the Item in progress and still reminds the others', async () => {
    await approveFor('Monitor'); // the coupled Alert becomes Resolved: a Reminder would Reopen it
    expect(await wait(12)).toBe(true);
    expect(await alertOf('Monitor')).toMatchObject({ status: 'RESOLVED', reminderCount: 0 });
    expect(await alertOf('Syringe')).toMatchObject({ reminderCount: 1 });
  });

  it('ends when the Item returns to Normal', async () => {
    const approved = await approveFor('Monitor');
    const monitor = await itemId('Monitor');
    await http().put(`/api/settings/overrides/${monitor}`).set('Cookie', director).send({ minRequired: 1 }).expect(200);
    expect((await get(approved.id)).inProgress).toBe(false);
    expect(await hasReplenishmentInProgress(prisma, monitor, '2025-01-06')).toBe(false);
    // back to Critical within the window: in progress again (the rule is a function of the current state)
    await http().delete(`/api/settings/overrides/${monitor}`).set('Cookie', director).expect(204);
    expect((await get(approved.id)).inProgress).toBe(true);
  });

  it('the delivery day itself still counts; the day after the Alert Reopens "expected delivery overdue", once', async () => {
    const approved = await approveFor('Monitor');
    await setReferenceDate('2025-01-08');
    expect(await get(approved.id)).toMatchObject({ inProgress: true, overdue: false });
    expect(await alertOf('Monitor')).toMatchObject({ status: 'RESOLVED' });
    expect(await overdueEvents('Monitor')).toHaveLength(0);

    await setReferenceDate('2025-01-09');
    expect(await get(approved.id)).toMatchObject({ inProgress: false, overdue: true, expectedDeliveryDate: '2025-01-08' });
    const alert = await alertOf('Monitor');
    expect(alert).toMatchObject({ status: 'NEW', reason: OVERDUE });
    expect(alert.events.filter((e) => e.type === 'REOPENED' && e.note === OVERDUE)).toMatchObject([
      { fromStatus: 'RESOLVED', toStatus: 'NEW', userId: null },
    ]);
    const notifications = await prisma.notification.findMany({ where: { type: 'ALERT_REOPENED', alertId: alert.id } });
    expect(notifications.length).toBeGreaterThan(0);
    expect(notifications[0].message).toContain(OVERDUE);
    const row = await prisma.recommendation.findUniqueOrThrow({ where: { id: approved.id } });
    expect(row.overdueReopenedAt).not.toBeNull();

    // Later recalculations (new Reference Dates, plain runs) never reopen it again.
    await prisma.alert.update({ where: { id: alert.id }, data: { status: 'ACKNOWLEDGED' } });
    await setReferenceDate('2025-01-10');
    await runRecalculation(prisma);
    expect(await overdueEvents('Monitor')).toHaveLength(1);
    expect(await alertOf('Monitor')).toMatchObject({ status: 'ACKNOWLEDGED' });
  });

  it('does not Reopen when the Item is back to Normal at the overdue date', async () => {
    const approved = await approveFor('Monitor');
    await http().put(`/api/settings/overrides/${await itemId('Monitor')}`).set('Cookie', director).send({ minRequired: 1 }).expect(200);
    await setReferenceDate('2025-01-10');
    expect(await get(approved.id)).toMatchObject({ inProgress: false, overdue: true });
    expect((await prisma.recommendation.findUniqueOrThrow({ where: { id: approved.id } })).overdueReopenedAt).toBeNull();
    expect(await prisma.alert.count({ where: { item: { name: 'Monitor' }, status: { not: 'CLEARED' } } })).toBe(0);
  });

  it('Reminders resume after the delivery date passes', async () => {
    await approveFor('Monitor');
    await setReferenceDate('2025-01-09'); // overdue: Alert is New again
    expect(await wait(12)).toBe(true);
    expect(await alertOf('Monitor')).toMatchObject({ status: 'NEW', reminderCount: 1 });
  });

  it('Hold Purchases and non-approved Recommendations never create a Replenishment in Progress', async () => {
    const hold = await approveFor('Ventilator', 'HOLD_PURCHASES');
    expect(hold).toMatchObject({ status: 'APPROVED', inProgress: false, expectedDeliveryDate: null, overdue: false });
    expect((await prisma.recommendation.findUniqueOrThrow({ where: { id: hold.id } })).approvalReferenceDate).toBeNull();
    expect(await hasReplenishmentInProgress(prisma, await itemId('Ventilator'), '2025-01-06')).toBe(false);

    // Draft, then Pending Approval, then Rejected Replenish: none is in progress.
    const monitor = await itemId('Monitor');
    const draft = await draftFor('Monitor', 'REPLENISH');
    expect(await hasReplenishmentInProgress(prisma, monitor, '2025-01-06')).toBe(false);
    await act(draft.id, 'submit').expect(200);
    expect(await hasReplenishmentInProgress(prisma, monitor, '2025-01-06')).toBe(false);
    await http().post(`/api/recommendations/${draft.id}/reject`).set('Cookie', director).send({ comment: 'no' }).expect(200);
    expect(await hasReplenishmentInProgress(prisma, monitor, '2025-01-06')).toBe(false);
  });
});
