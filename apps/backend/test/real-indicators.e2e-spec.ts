// Sanity check of the indicators on the real dataset with the default settings (ticket 03).
// Known results on the Reference Date 2026-02-12 (the dataset's last date):
//   Urgency Level: Critical 13, Attention 16, Normal 21
//   ABC Class:     A 24, B 13, C 13
//   Median autonomy about 9 days; Stock Value about EUR 1.19 bn, of which Excess Stock about EUR 237 m.
// (Exact values: median 9.23 days, Stock Value 1,187,053,872.67, Excess Stock 236,614,283.06.)
import type { INestApplication } from '@nestjs/common';
import * as path from 'node:path';
import request from 'supertest';
import { findProjectRoot } from '../src/config/env';
import { runEtl } from '../src/etl/run-etl';
import { PrismaService } from '../src/prisma/prisma.service';
import { seedDirector } from '../src/users/director-seed';
import { createTestApp, DIRECTOR } from './app';
import { resetDatabase } from './helpers';

const REAL_DATASET = path.join(findProjectRoot(), '2-Hospital_Dataset');

describe('Indicators on the real dataset (default settings)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let body: {
    referenceDate: string;
    items: unknown[];
    portfolio: {
      urgencyCounts: Record<string, number>;
      abcCounts: Record<string, number>;
      medianAutonomyDays: number;
      stockValue: number;
      excessStockValue: number;
    };
  };

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    await resetDatabase(prisma);
    await seedDirector(prisma);
    await runEtl(prisma, REAL_DATASET);
    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: DIRECTOR.email, password: DIRECTOR.password })
      .expect(200);
    const cookie = (login.headers['set-cookie'] as unknown as string[])[0].split(';')[0];
    body = (await request(app.getHttpServer()).get('/api/items').set('Cookie', cookie).expect(200)).body;
  });
  afterAll(async () => {
    await app.close();
  });

  it('uses the dataset last date as the Reference Date and returns the 50 Items', () => {
    expect(body.referenceDate).toBe('2026-02-12');
    expect(body.items).toHaveLength(50);
  });

  it('Urgency Level: Critical 13, Attention 16, Normal 21', () => {
    expect(body.portfolio.urgencyCounts).toEqual({ CRITICAL: 13, ATTENTION: 16, NORMAL: 21 });
  });

  it('ABC Class: A 24, B 13, C 13', () => {
    expect(body.portfolio.abcCounts).toEqual({ A: 24, B: 13, C: 13 });
  });

  it('median autonomy is about 9 days', () => {
    expect(body.portfolio.medianAutonomyDays).toBeGreaterThan(8.5);
    expect(body.portfolio.medianAutonomyDays).toBeLessThan(9.5);
  });

  it('Stock Value is about EUR 1.19 bn, of which Excess Stock is about EUR 237 m', () => {
    expect(body.portfolio.stockValue / 1e9).toBeCloseTo(1.19, 2);
    expect(body.portfolio.excessStockValue / 1e6).toBeCloseTo(237, 0);
  });
});
