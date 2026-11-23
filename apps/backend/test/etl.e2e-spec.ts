// ETL behaviour against the test database, using the hand-written fixture in fixtures/basic.
//
// Hand-computed expectations for that fixture:
//   Items (Item_ID + Item_Name, ADR 0001): 101 Surgical Mask, 102 Ventilator, 101 Ventilator → 3
//   Snapshots: 5, from 2025-01-01 to 2025-01-05
//   Latest Snapshot per Item gives Category / Vendor:
//     101 Surgical Mask (2025-01-03) → Equipment / V002
//     102 Ventilator    (2025-01-05) → Equipment / V003
//     101 Ventilator    (2025-01-02) → Equipment / V003
//   Data Quality Flags: 2025-01-03 Surgical Mask stock 1200 > max 1000;
//                       2025-01-01 Ventilator #102 min 30 > max 25.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { runEtl } from '../src/etl/run-etl';
import { createPrismaClient, PrismaClient } from '../src/prisma/prisma-client';
import { BASIC_FIXTURE, copyFixture, hashFolder, isoDate, resetDatabase } from './helpers';

describe('ETL', () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    prisma = createPrismaClient();
  });
  beforeEach(async () => {
    await resetDatabase(prisma);
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function itemsByKey() {
    const items = await prisma.item.findMany({ orderBy: { id: 'asc' } });
    return Object.fromEntries(items.map((i) => [`${i.sourceItemId} ${i.name}`, i]));
  }

  it('loads Items, Snapshots and Vendors from the dataset folder', async () => {
    const summary = await runEtl(prisma, BASIC_FIXTURE);

    expect(summary).toEqual({
      items: 3,
      itemsCreated: 3,
      snapshots: 5,
      vendors: 3,
      firstDate: '2025-01-01',
      lastDate: '2025-01-05',
      stockAboveMaxCapacity: 1,
      minAboveMax: 1,
    });
    expect(await prisma.snapshot.count()).toBe(5);
    expect(await prisma.vendor.findMany({ orderBy: { code: 'asc' } })).toEqual([
      { code: 'V001', name: 'MedSupplies Inc.', contractedLeadTimeDays: 5 },
      { code: 'V002', name: 'EquipMed Co.', contractedLeadTimeDays: 30 },
      { code: 'V003', name: 'HealthTools Ltd.', contractedLeadTimeDays: 15 },
    ]);
  });

  it('takes each Item’s Category and Vendor from its latest Snapshot', async () => {
    await runEtl(prisma, BASIC_FIXTURE);
    const items = await itemsByKey();

    expect(Object.keys(items).sort()).toEqual(['101 Surgical Mask', '101 Ventilator', '102 Ventilator']);
    expect(items['101 Surgical Mask']).toMatchObject({ category: 'Equipment', vendorCode: 'V002' });
    expect(items['102 Ventilator']).toMatchObject({ category: 'Equipment', vendorCode: 'V003' });
    expect(items['101 Ventilator']).toMatchObject({ category: 'Equipment', vendorCode: 'V003' });
  });

  it('stores Snapshot values unchanged and sets Data Quality Flags', async () => {
    await runEtl(prisma, BASIC_FIXTURE);
    const flagged = await prisma.snapshot.findMany({
      where: { OR: [{ stockAboveMaxCapacity: true }, { minAboveMax: true }] },
      include: { item: true },
      orderBy: { date: 'asc' },
    });

    expect(
      flagged.map((s) => ({
        date: isoDate(s.date),
        item: `${s.item.sourceItemId} ${s.item.name}`,
        stock: s.currentStock,
        min: s.minRequired,
        max: s.maxCapacity,
        stockAboveMaxCapacity: s.stockAboveMaxCapacity,
        minAboveMax: s.minAboveMax,
      })),
    ).toEqual([
      { date: '2025-01-01', item: '102 Ventilator', stock: 20, min: 30, max: 25, stockAboveMaxCapacity: false, minAboveMax: true },
      { date: '2025-01-03', item: '101 Surgical Mask', stock: 1200, min: 100, max: 1000, stockAboveMaxCapacity: true, minAboveMax: false },
    ]);

    const precise = await prisma.snapshot.findFirstOrThrow({ where: { date: new Date('2025-01-05') } });
    expect(precise.unitCost.toString()).toBe('19999.99');
    expect(precise.avgUsagePerDay.toNumber()).toBe(2);
  });

  it('is idempotent and keeps Item ids stable on a re-run', async () => {
    await runEtl(prisma, BASIC_FIXTURE);
    const before = await itemsByKey();

    const summary = await runEtl(prisma, BASIC_FIXTURE);

    expect(summary.itemsCreated).toBe(0);
    expect(await prisma.snapshot.count()).toBe(5);
    expect(await prisma.vendor.count()).toBe(3);
    expect(await itemsByKey()).toEqual(before);
  });

  it('updates an existing Item’s Category and Vendor when newer data arrives, keeping its id', async () => {
    await runEtl(prisma, BASIC_FIXTURE);
    const before = await itemsByKey();

    const dir = copyFixture(BASIC_FIXTURE);
    fs.appendFileSync(
      path.join(dir, 'inventory_data.csv'),
      '2025-01-10,101,Consumable,Surgical Mask,300,100,1000,0.80,45,5,V001\n',
    );
    await runEtl(prisma, dir);
    const after = await itemsByKey();

    expect(after['101 Surgical Mask'].id).toBe(before['101 Surgical Mask'].id);
    expect(after['101 Surgical Mask']).toMatchObject({ category: 'Consumable', vendorCode: 'V001' });
    expect(await prisma.snapshot.count()).toBe(6);
  });

  it('never modifies the original files', async () => {
    const before = hashFolder(BASIC_FIXTURE);
    await runEtl(prisma, BASIC_FIXTURE);
    await runEtl(prisma, BASIC_FIXTURE);
    expect(hashFolder(BASIC_FIXTURE)).toEqual(before);
  });

  it('leaves the database unchanged when the dataset is invalid', async () => {
    await runEtl(prisma, BASIC_FIXTURE);

    const dir = copyFixture(BASIC_FIXTURE);
    fs.appendFileSync(path.join(dir, 'inventory_data.csv'), '2025-01-11,101,Consumable,Surgical Mask,lots,1,2,1,1,1,V001\n');

    await expect(runEtl(prisma, dir)).rejects.toThrow(/Current_Stock: expected a non-negative whole number/);
    expect(await prisma.snapshot.count()).toBe(5);
    expect(await prisma.vendor.count()).toBe(3);
  });

  it('reports a clear error when a dataset file is missing', async () => {
    const dir = copyFixture(BASIC_FIXTURE);
    fs.rmSync(path.join(dir, 'vendor_data.csv'));
    await expect(runEtl(prisma, dir)).rejects.toThrow(/Dataset file not found: .*vendor_data\.csv/);
  });
});
