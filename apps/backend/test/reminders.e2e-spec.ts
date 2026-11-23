// Reminders driven by the injectable clock: no test waits for real hours.
// Dataset: fixtures/indicators at the default Reference Date: Monitor is Critical, Syringe is Attention, the others Normal.
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as path from 'node:path';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { hashPassword } from '../src/auth/password';
import { CLOCK, FakeClock } from '../src/clock/clock';
import { runEtl } from '../src/etl/run-etl';
import { PrismaService } from '../src/prisma/prisma.service';
import { runRecalculation } from '../src/recalculation/run-recalculation';
import { RemindersService } from '../src/reminders/reminders';
import * as replenishment from '../src/reminders/replenishment';
import { seedDirector } from '../src/users/director-seed';
import { FIXTURES, resetDatabase } from './helpers';

const HOUR = 60 * 60 * 1000;

describe('Reminders', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let reminders: RemindersService;
  const clock = new FakeClock('2026-03-01T10:00:00Z');
  const savedRepeat = process.env.ALERT_REPEAT_HOURS;

  const alertOf = (name: string) =>
    prisma.alert.findFirstOrThrow({ where: { item: { name }, status: { not: 'CLEARED' } }, include: { events: true } });
  const reminderNotifications = () => prisma.notification.findMany({ where: { type: 'REMINDER' } });
  /** Lets `hours` of clock time pass and runs the scheduler's tick once. */
  const wait = (hours: number) => {
    clock.advance(hours * HOUR);
    return reminders.tick();
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(CLOCK)
      .useValue(clock)
      .compile();
    app = configureApp(moduleRef.createNestApplication());
    await app.init();
    prisma = app.get(PrismaService);
    reminders = app.get(RemindersService);
    await resetDatabase(prisma);
    await seedDirector(prisma);
    await runEtl(prisma, path.join(FIXTURES, 'indicators'));
    const password = await hashPassword('team-password');
    await prisma.user.create({
      data: { name: 'Team', email: 'team@hospital.test', passwordHash: password, role: 'PROCUREMENT_TEAM', status: 'ACTIVE' },
    });
    await prisma.user.create({
      data: { name: 'Pending', email: 'pending@hospital.test', passwordHash: password, role: 'PROCUREMENT_TEAM', status: 'PENDING' },
    });
  }, 60_000);

  beforeEach(async () => {
    delete process.env.ALERT_REPEAT_HOURS;
    clock.set(new Date('2026-03-01T10:00:00Z'));
    await prisma.notification.deleteMany();
    await prisma.alertEvent.deleteMany();
    await prisma.alert.deleteMany();
    await prisma.reminderState.deleteMany();
    await runRecalculation(prisma); // opens the Monitor (Critical) and Syringe (Attention) Alerts
    await prisma.notification.deleteMany();
    await reminders.tick(); // baseline
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });
  afterAll(async () => {
    if (savedRepeat === undefined) delete process.env.ALERT_REPEAT_HOURS;
    else process.env.ALERT_REPEAT_HOURS = savedRepeat;
    await app.close();
  });

  it('the first tick only sets the baseline and fires nothing', async () => {
    await prisma.reminderState.deleteMany();
    clock.advance(100 * HOUR);
    expect(await reminders.tick()).toBe(false);
    expect(await reminderNotifications()).toHaveLength(0);
    expect((await alertOf('Monitor')).reminderCount).toBe(0);
    expect((await prisma.reminderState.findUniqueOrThrow({ where: { id: 1 } })).lastRoundAt).toEqual(clock.now());
  });

  it('runs no round before ALERT_REPEAT_HOURS (default 12)', async () => {
    expect(await wait(11.9)).toBe(false);
    expect(await reminderNotifications()).toHaveLength(0);
    expect((await alertOf('Monitor')).reminderCount).toBe(0);
  });

  it('a round after the interval counts a Reminder, logs it and notifies every Active User', async () => {
    expect(await wait(12)).toBe(true);
    for (const name of ['Monitor', 'Syringe']) {
      const alert = await alertOf(name);
      expect(alert.reminderCount).toBe(1);
      expect(alert.events.find((e) => e.type === 'REMINDER')).toMatchObject({ userId: null, note: 'Reminder #1' });
      const notifications = await prisma.notification.findMany({ where: { type: 'REMINDER', alertId: alert.id } });
      expect(notifications).toHaveLength(2); // director + team; the Pending User gets nothing
      expect(notifications[0].message).toContain('Reminder #1');
    }
  });

  it('the clock advancing twice gives two rounds', async () => {
    expect(await wait(12)).toBe(true);
    expect(await wait(6)).toBe(false);
    expect(await wait(6)).toBe(true);
    const alert = await alertOf('Monitor');
    expect(alert.reminderCount).toBe(2);
    expect(alert.events.filter((e) => e.type === 'REMINDER').map((e) => e.note)).toEqual(['Reminder #1', 'Reminder #2']);
    expect(await reminderNotifications()).toHaveLength(2 * 2 * 2);
  });

  it('keeps New, Viewed and Acknowledged statuses but still reminds', async () => {
    const monitor = await alertOf('Monitor');
    const syringe = await alertOf('Syringe');
    await prisma.alert.update({ where: { id: monitor.id }, data: { status: 'VIEWED' } });
    await prisma.alert.update({ where: { id: syringe.id }, data: { status: 'ACKNOWLEDGED' } });
    await wait(12);
    expect(await alertOf('Monitor')).toMatchObject({ status: 'VIEWED', reminderCount: 1 });
    expect(await alertOf('Syringe')).toMatchObject({ status: 'ACKNOWLEDGED', reminderCount: 1 });
  });

  it('Reopens Ignored and Resolved Alerts to New with a single Notification each', async () => {
    const monitor = await alertOf('Monitor');
    const syringe = await alertOf('Syringe');
    await prisma.alert.update({ where: { id: monitor.id }, data: { status: 'IGNORED' } });
    await prisma.alert.update({ where: { id: syringe.id }, data: { status: 'RESOLVED' } });
    await wait(12);
    for (const [name, from] of [['Monitor', 'IGNORED'], ['Syringe', 'RESOLVED']] as const) {
      const alert = await alertOf(name);
      expect(alert).toMatchObject({ status: 'NEW', reminderCount: 1 });
      expect(alert.events.find((e) => e.type === 'REOPENED')).toMatchObject({ fromStatus: from, toStatus: 'NEW', userId: null });
      const notifications = await prisma.notification.findMany({ where: { alertId: alert.id } });
      expect(notifications).toHaveLength(2); // one per Active User: no extra ALERT_REOPENED
      expect(notifications.every((n) => n.type === 'REMINDER')).toBe(true);
      expect(notifications[0].message).toContain('reopened');
    }
  });

  it('leaves Alerts whose Item is Normal untouched', async () => {
    const normal = await prisma.item.findFirstOrThrow({ where: { name: { notIn: ['Monitor', 'Syringe'] } } });
    const stale = await prisma.alert.create({ data: { itemId: normal.id, level: 'ATTENTION', status: 'IGNORED' } });
    await wait(12);
    expect(await prisma.alert.findUniqueOrThrow({ where: { id: stale.id } })).toMatchObject({ status: 'IGNORED', reminderCount: 0 });
    expect(await prisma.notification.count({ where: { alertId: stale.id } })).toBe(0);
  });

  it('leaves Cleared Alerts untouched', async () => {
    const monitor = await alertOf('Monitor');
    await prisma.alert.update({ where: { id: monitor.id }, data: { status: 'CLEARED' } });
    await wait(12);
    expect(await prisma.alert.findUniqueOrThrow({ where: { id: monitor.id } })).toMatchObject({ status: 'CLEARED', reminderCount: 0 });
    expect(await prisma.notification.count({ where: { alertId: monitor.id } })).toBe(0);
  });

  it('skips Alerts with a Replenishment in Progress (the hook for ticket 17)', async () => {
    const monitor = await alertOf('Monitor');
    const spy = jest
      .spyOn(replenishment, 'hasReplenishmentInProgress')
      .mockImplementation(async (_prisma, itemId) => itemId === monitor.itemId);
    await wait(12);
    expect((await alertOf('Monitor')).reminderCount).toBe(0);
    expect((await alertOf('Syringe')).reminderCount).toBe(1);
    expect(spy).toHaveBeenCalledWith(expect.anything(), monitor.itemId, '2025-01-10');
  });

  it('reads ALERT_REPEAT_HOURS when called, so the interval can be shortened', async () => {
    process.env.ALERT_REPEAT_HOURS = '1';
    expect(await wait(0.5)).toBe(false);
    expect(await wait(0.5)).toBe(true);
    expect((await alertOf('Monitor')).reminderCount).toBe(1);
  });

  it('is not affected by the Simulation: the interval is measured on the real clock only', async () => {
    await prisma.simulationState.upsert({
      where: { id: 1 },
      create: { id: 1, status: 'RUNNING', currentDate: new Date('2025-01-05T00:00:00Z'), secondsPerDay: 1 },
      update: {},
    });
    try {
      expect(await wait(1)).toBe(false);
    } finally {
      await prisma.simulationState.deleteMany();
    }
  });
});
