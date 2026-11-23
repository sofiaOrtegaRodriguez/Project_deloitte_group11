// Integration test against the real CSVs in 2-Hospital_Dataset: known totals.
import * as path from 'node:path';
import { findProjectRoot } from '../src/config/env';
import { runEtl } from '../src/etl/run-etl';
import { createPrismaClient, PrismaClient } from '../src/prisma/prisma-client';
import { hashFolder, isoDate, resetDatabase } from './helpers';

const REAL_DATASET = path.join(findProjectRoot(), '2-Hospital_Dataset');

describe('ETL on the real dataset', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = createPrismaClient();
    await resetDatabase(prisma);
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('loads 50 Items and 500 Snapshots from 2024-10-01 to 2026-02-12, without touching the files', async () => {
    const before = hashFolder(REAL_DATASET);

    const summary = await runEtl(prisma, REAL_DATASET);

    expect(summary).toEqual({
      items: 50,
      itemsCreated: 50,
      snapshots: 500,
      vendors: 3,
      firstDate: '2024-10-01',
      lastDate: '2026-02-12',
      stockAboveMaxCapacity: 186,
      minAboveMax: 13,
      negativeValue: 0,
      nonIntegerQuantity: 0,
      duplicateSnapshot: 0,
      recalculation: expect.objectContaining({ referenceDate: '2026-02-12' }),
    });
    expect(await prisma.item.count()).toBe(50);
    expect(await prisma.snapshot.count()).toBe(500);

    const range = await prisma.snapshot.aggregate({ _min: { date: true }, _max: { date: true } });
    expect(isoDate(range._min.date!)).toBe('2024-10-01');
    expect(isoDate(range._max.date!)).toBe('2026-02-12');

    expect(hashFolder(REAL_DATASET)).toEqual(before);
  });
});
