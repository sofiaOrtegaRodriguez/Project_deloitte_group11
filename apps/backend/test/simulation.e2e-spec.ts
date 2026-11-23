// Simulation API driven by the injectable clock: no test waits for real seconds.
// Dataset: fixtures/indicators, dates 2025-01-01 .. 2025-01-10.
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
import { SimulationService } from '../src/simulation/simulation';
import { seedDirector } from '../src/users/director-seed';
import { DIRECTOR } from './app';
import { FIXTURES, resetDatabase } from './helpers';

describe('Simulation API', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let simulation: SimulationService;
  let director: string;
  let team: string;
  const clock = new FakeClock('2026-03-01T10:00:00Z');
  const http = () => request(app.getHttpServer());

  async function login(email: string, password: string): Promise<string> {
    const res = await http().post('/api/auth/login').send({ email, password }).expect(200);
    return (res.headers['set-cookie'] as unknown as string[])[0].split(';')[0];
  }
  const start = (body: object, cookie = director) => http().post('/api/simulation/start').set('Cookie', cookie).send(body);
  const act = (action: 'pause' | 'resume' | 'stop', cookie = director) =>
    http().post(`/api/simulation/${action}`).set('Cookie', cookie);
  const status = async (cookie = director) => (await http().get('/api/simulation').set('Cookie', cookie).expect(200)).body;
  const items = async () => (await http().get('/api/items').set('Cookie', director).expect(200)).body;
  /** Lets `seconds` of fake time pass and runs the stepper once, as the real-time interval would. */
  const wait = async (seconds: number) => {
    clock.advance(seconds * 1000);
    return simulation.tick();
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(CLOCK)
      .useValue(clock)
      .compile();
    app = configureApp(moduleRef.createNestApplication());
    await app.init();
    prisma = app.get(PrismaService);
    simulation = app.get(SimulationService);
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
  }, 60_000);

  afterEach(async () => {
    await prisma.simulationState.deleteMany();
    await prisma.settings.deleteMany();
    await prisma.configurationLog.deleteMany();
  });
  afterAll(async () => {
    await app.close();
  });

  it('is stopped by default and visible to every User', async () => {
    const expected = { status: 'STOPPED', running: false, startDate: null, currentDate: null, secondsPerDay: null, datasetEnd: '2025-01-10' };
    expect(await status()).toEqual(expected);
    expect(await status(team)).toEqual(expected);
  });

  it('start puts the Reference Date on the start date; each elapsed period advances one day and recalculates', async () => {
    const before = await items();
    expect(before.referenceDate).toBe('2025-01-10');
    const res = await start({ startDate: '2025-01-03', secondsPerDay: 5 }).expect(200);
    expect(res.body).toMatchObject({ status: 'RUNNING', running: true, currentDate: '2025-01-03', secondsPerDay: 5 });
    const day3 = await items();
    expect(day3.referenceDate).toBe('2025-01-03');
    expect(day3.items).not.toEqual(before.items); // recalculated as of the earlier date

    expect(await wait(4)).toBe(false); // not enough time yet
    expect((await status()).currentDate).toBe('2025-01-03');
    expect(await wait(1)).toBe(true);
    expect((await items()).referenceDate).toBe('2025-01-04');
    expect(await wait(5)).toBe(true);
    expect((await status(team)).currentDate).toBe('2025-01-05');
    expect((await items()).referenceDate).toBe('2025-01-05');
  });

  it('pause stops advancing; resume continues with a full day', async () => {
    await start({ startDate: '2025-01-03', secondsPerDay: 5 }).expect(200);
    await wait(5);
    const paused = await act('pause').expect(200);
    expect(paused.body).toMatchObject({ status: 'PAUSED', running: false, currentDate: '2025-01-04' });
    expect(await wait(60)).toBe(false);
    expect((await items()).referenceDate).toBe('2025-01-04');

    await act('resume').expect(200);
    expect(await wait(4)).toBe(false);
    expect(await wait(1)).toBe(true);
    expect((await items()).referenceDate).toBe('2025-01-05');
  });

  it('stop restores the previous Reference Date and recalculates', async () => {
    await http().patch('/api/settings').set('Cookie', director).send({ referenceDate: '2025-01-07' }).expect(200);
    await start({ startDate: '2025-01-02', secondsPerDay: 1 }).expect(200);
    await wait(1);
    const stopped = await act('stop').expect(200);
    expect(stopped.body).toMatchObject({ status: 'STOPPED', running: false, currentDate: null });
    expect((await items()).referenceDate).toBe('2025-01-07');
    expect((await prisma.settings.findUniqueOrThrow({ where: { id: 1 } })).referenceDate?.toISOString().slice(0, 10)).toBe('2025-01-07');
    expect(await wait(10)).toBe(false);
    expect((await items()).referenceDate).toBe('2025-01-07');
  });

  it('stop restores "follow the dataset" when there was no Reference Date set', async () => {
    await start({ startDate: '2025-01-02', secondsPerDay: 1 }).expect(200);
    await act('stop').expect(200);
    expect((await prisma.settings.findUniqueOrThrow({ where: { id: 1 } })).referenceDate).toBeNull();
    expect((await items()).referenceDate).toBe('2025-01-10');
  });

  it('at the end of the data it finishes on the last date; stop then restores', async () => {
    await start({ startDate: '2025-01-09', secondsPerDay: 1 }).expect(200);
    expect(await wait(1)).toBe(true); // 01-10
    expect(await wait(1)).toBe(false); // would pass the end
    const finished = await status();
    expect(finished).toMatchObject({ status: 'FINISHED', running: false, currentDate: '2025-01-10' });
    expect(await wait(10)).toBe(false);
    expect((await items()).referenceDate).toBe('2025-01-10');
    // still in progress: no manual change, no new start
    await http().patch('/api/settings').set('Cookie', director).send({ referenceDate: '2025-01-02' }).expect(409);
    await start({ startDate: '2025-01-02', secondsPerDay: 1 }).expect(409);
    await act('stop').expect(200);
    expect((await status()).status).toBe('STOPPED');
  });

  it('state is persisted in the database, so a restarted app resumes where it was', async () => {
    await start({ startDate: '2025-01-03', secondsPerDay: 5 }).expect(200);
    const row = await prisma.simulationState.findUniqueOrThrow({ where: { id: 1 } });
    expect(row).toMatchObject({ status: 'RUNNING', secondsPerDay: 5 });
    expect(row.currentDate?.toISOString().slice(0, 10)).toBe('2025-01-03');
  });

  it('rejects invalid starts with 400', async () => {
    await start({ startDate: '2024-12-31', secondsPerDay: 5 }).expect(400);
    await start({ startDate: '2025-01-11', secondsPerDay: 5 }).expect(400);
    await start({ startDate: '2025-02-30', secondsPerDay: 5 }).expect(400);
    await start({ startDate: 'tomorrow', secondsPerDay: 5 }).expect(400);
    await start({ startDate: '2025-01-03', secondsPerDay: 0 }).expect(400);
    await start({ startDate: '2025-01-03', secondsPerDay: 1.5 }).expect(400);
    await start({ startDate: '2025-01-03' }).expect(400);
    expect((await status()).status).toBe('STOPPED');
  });

  it('rejects out-of-state actions with 409', async () => {
    await act('pause').expect(409);
    await act('resume').expect(409);
    await act('stop').expect(409);
    await start({ startDate: '2025-01-03', secondsPerDay: 5 }).expect(200);
    await start({ startDate: '2025-01-03', secondsPerDay: 5 }).expect(409);
    await act('resume').expect(409);
  });

  it('only the Director may write; every User may read', async () => {
    await start({ startDate: '2025-01-03', secondsPerDay: 5 }, team).expect(403);
    await act('pause', team).expect(403);
    await act('resume', team).expect(403);
    await act('stop', team).expect(403);
    await http().get('/api/simulation').expect(401);
    await start({ startDate: '2025-01-03', secondsPerDay: 5 }).expect(200);
    await act('stop', team).expect(403);
    expect((await status(team)).status).toBe('RUNNING');
  });

  it('a manual Reference Date change is rejected with 409 while running or paused, and allowed again after stop', async () => {
    const change = (date: string) => http().patch('/api/settings').set('Cookie', director).send({ referenceDate: date });
    await start({ startDate: '2025-01-03', secondsPerDay: 5 }).expect(200);
    await change('2025-01-06').expect(409);
    await act('pause').expect(200);
    await change('2025-01-06').expect(409);
    // other settings still work, and re-sending the current Reference Date is not a change
    await http().patch('/api/settings').set('Cookie', director).send({ lowTurnoverThreshold: 20, referenceDate: '2025-01-03' }).expect(200);
    await act('stop').expect(200);
    await change('2025-01-06').expect(200);
  });

  it('logs start and stop in the configuration log, but not each step', async () => {
    await start({ startDate: '2025-01-03', secondsPerDay: 1 }).expect(200);
    await wait(1);
    await wait(1);
    await act('stop').expect(200);
    const log = await http().get('/api/settings/log').set('Cookie', director).expect(200);
    expect(log.body).toHaveLength(2);
  });
});
