// ETL behaviour against the test database, using the hand-written fixture in fixtures/basic.
//
// Hand-computed expectations for that fixture:
//   Items (Item_ID + Item_Name, ADR 0001): 101 Surgical Mask, 102 Ventilator, 101 Ventilator → 3
//   Snapshots: 5, from 2025-01-01 to 2025-01-05
//   Latest Snapshot per Item gives Category / Vendor (each differs from the Item's earlier Snapshot,
//   so taking the wrong Snapshot would show):
//     101 Surgical Mask (2025-01-03) → Equipment / V002   (earlier: Consumable / V001)
//     102 Ventilator    (2025-01-05) → Equipment / V003   (earlier: Consumable / V002)
//     101 Ventilator    (2025-01-02) → Equipment / V003   (only Snapshot)
//   Data Quality Flags: 2025-01-03 Surgical Mask stock 1200 > max 1000;
//                       2025-01-01 Ventilator #102 min 30 > max 25.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { runEtl } from '../src/etl/run-etl';
import { createPrismaClient, PrismaClient } from '../src/prisma/prisma-client';
import { BASIC_FIXTURE, copyFixture, hashFolder, isoDate, resetDatabase } from './helpers';

const NO_EXTRA_FLAGS = { negativeValue: 0, nonIntegerQuantity: 0, duplicateSnapshot: 0 };

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

  /** Every Snapshot's content, independent of internal ids (which change when Snapshots are replaced). */
  async function snapshotContents() {
    const snapshots = await prisma.snapshot.findMany({ include: { item: true }, orderBy: { id: 'asc' } });
    return snapshots.map(({ id: _id, itemId: _itemId, item, ...s }) => ({
      ...s,
      item: `${item.sourceItemId} ${item.name}`,
      date: isoDate(s.date),
      currentStock: s.currentStock.toString(),
      minRequired: s.minRequired.toString(),
      maxCapacity: s.maxCapacity.toString(),
      unitCost: s.unitCost.toString(),
      avgUsagePerDay: s.avgUsagePerDay.toString(),
      replenishmentTimeDays: s.replenishmentTimeDays.toString(),
    }));
  }

  const vendorContents = () => prisma.vendor.findMany({ orderBy: { code: 'asc' } });

  /** A copy of the basic fixture with extra inventory rows appended. */
  function fixtureWith(...rows: string[]): string {
    const dir = copyFixture(BASIC_FIXTURE);
    fs.appendFileSync(path.join(dir, 'inventory_data.csv'), rows.map((r) => `${r}\n`).join(''));
    return dir;
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
      ...NO_EXTRA_FLAGS,
      recalculation: expect.objectContaining({ referenceDate: '2025-01-05' }),
    });
    expect(await prisma.snapshot.count()).toBe(5);
    expect(await vendorContents()).toEqual([
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
    const flagged = (await snapshotContents()).filter((s) => s.stockAboveMaxCapacity || s.minAboveMax);

    expect(
      flagged.map((s) => ({
        date: s.date,
        item: s.item,
        stock: s.currentStock,
        min: s.minRequired,
        max: s.maxCapacity,
        stockAboveMaxCapacity: s.stockAboveMaxCapacity,
        minAboveMax: s.minAboveMax,
      })),
    ).toEqual([
      { date: '2025-01-03', item: '101 Surgical Mask', stock: '1200', min: '100', max: '1000', stockAboveMaxCapacity: true, minAboveMax: false },
      { date: '2025-01-01', item: '102 Ventilator', stock: '20', min: '30', max: '25', stockAboveMaxCapacity: false, minAboveMax: true },
    ]);
  });

  it('stores decimals exactly, without rounding', async () => {
    await runEtl(prisma, fixtureWith('2025-01-10,103,Consumable,Gloves,5.5,1,10,4467.555,12.3456789,7.25,V001'));

    const [gloves] = (await snapshotContents()).filter((s) => s.item === '103 Gloves');
    expect(gloves).toMatchObject({
      currentStock: '5.5',
      unitCost: '4467.555',
      avgUsagePerDay: '12.3456789',
      replenishmentTimeDays: '7.25',
    });
  });

  it('loads anomalous rows unchanged and flags them instead of rejecting them', async () => {
    const summary = await runEtl(
      prisma,
      fixtureWith(
        '2025-01-10,103,Consumable,Gloves,-5,1,10,1.00,1,1,V001', // negative stock
        '2025-01-11,103,Consumable,Gloves,5,1,10,1.00,1,2.5,V001', // non-integer Replenishment Time
        '2025-01-12,103,Consumable,Gloves,5,1,10,1.00,1,1,V001', // duplicated on the next line
        '2025-01-12,103,Equipment,Gloves,6,1,10,1.00,1,1,V002',
      ),
    );

    expect(summary).toMatchObject({ snapshots: 9, negativeValue: 1, nonIntegerQuantity: 1, duplicateSnapshot: 2 });
    const gloves = (await snapshotContents()).filter((s) => s.item === '103 Gloves');
    expect(gloves.map((s) => [s.date, s.currentStock, s.replenishmentTimeDays, s.negativeValue, s.nonIntegerQuantity, s.duplicateSnapshot])).toEqual([
      ['2025-01-10', '-5', '1', true, false, false],
      ['2025-01-11', '5', '2.5', false, true, false],
      ['2025-01-12', '5', '1', false, false, true],
      ['2025-01-12', '6', '1', false, false, true],
    ]);
  });

  it('is idempotent: a re-run gives the same Items, Snapshots and Vendors', async () => {
    await runEtl(prisma, BASIC_FIXTURE);
    const before = { items: await itemsByKey(), snapshots: await snapshotContents(), vendors: await vendorContents() };

    const summary = await runEtl(prisma, BASIC_FIXTURE);

    expect(summary.itemsCreated).toBe(0);
    expect(await itemsByKey()).toEqual(before.items);
    expect(await snapshotContents()).toEqual(before.snapshots);
    expect(await vendorContents()).toEqual(before.vendors);
  });

  it('updates an existing Item’s Category and Vendor when newer data arrives, keeping its id', async () => {
    await runEtl(prisma, BASIC_FIXTURE);
    const before = await itemsByKey();

    await runEtl(prisma, fixtureWith('2025-01-10,101,Consumable,Surgical Mask,300,100,1000,0.80,45,5,V001'));
    const after = await itemsByKey();

    expect(after['101 Surgical Mask'].id).toBe(before['101 Surgical Mask'].id);
    expect(after['101 Surgical Mask']).toMatchObject({ category: 'Consumable', vendorCode: 'V001' });
    expect(await prisma.snapshot.count()).toBe(6);
  });

  it('keeps Items that are no longer in the dataset, with their id, while replacing their Snapshots', async () => {
    await runEtl(prisma, BASIC_FIXTURE);
    const before = await itemsByKey();

    const dir = copyFixture(BASIC_FIXTURE);
    const file = path.join(dir, 'inventory_data.csv');
    fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace(/^.*,101,Equipment,Ventilator,.*\n/m, ''));
    const summary = await runEtl(prisma, dir);

    expect(summary).toMatchObject({ items: 3, itemsCreated: 0, snapshots: 4 });
    expect(await itemsByKey()).toEqual(before);
    expect((await snapshotContents()).some((s) => s.item === '101 Ventilator')).toBe(false);
  });

  it('never modifies the original files', async () => {
    const before = hashFolder(BASIC_FIXTURE);
    await runEtl(prisma, BASIC_FIXTURE);
    await runEtl(prisma, BASIC_FIXTURE);
    expect(hashFolder(BASIC_FIXTURE)).toEqual(before);
  });

  it('rolls everything back when something fails inside the transaction', async () => {
    await runEtl(prisma, BASIC_FIXTURE);
    const before = { items: await itemsByKey(), snapshots: await snapshotContents(), vendors: await vendorContents() };

    // A run that would add an Item and change Vendors and Item Categories, but fails on the last write.
    const dir = fixtureWith('2025-01-10,103,Consumable,Gloves,5,1,10,1.00,1,1,V001', '2025-01-11,101,Consumable,Surgical Mask,5,1,10,1.00,1,1,V001');
    fs.writeFileSync(path.join(dir, 'vendor_data.csv'), 'Vendor_ID,Vendor_Name,Avg_Lead_Time (days)\nV009,Other Vendor,9\n');
    const failing = prisma.$extends({
      query: {
        snapshot: {
          createMany: () => Promise.reject(new Error('simulated failure while inserting Snapshots')),
        },
      },
    }) as unknown as PrismaClient;

    await expect(runEtl(failing, dir)).rejects.toThrow('simulated failure while inserting Snapshots');

    expect(await itemsByKey()).toEqual(before.items);
    expect(await snapshotContents()).toEqual(before.snapshots);
    expect(await vendorContents()).toEqual(before.vendors);
  });

  it('leaves the database unchanged when the dataset cannot be read', async () => {
    await runEtl(prisma, BASIC_FIXTURE);
    const before = await snapshotContents();

    await expect(runEtl(prisma, fixtureWith('2025-01-11,101,Consumable,Surgical Mask,lots,1,2,1,1,1,V001'))).rejects.toThrow(
      /Current_Stock: expected a number/,
    );
    expect(await snapshotContents()).toEqual(before);
    expect(await prisma.vendor.count()).toBe(3);
  });

  it('reports a clear error when a dataset file is missing', async () => {
    const dir = copyFixture(BASIC_FIXTURE);
    fs.rmSync(path.join(dir, 'vendor_data.csv'));
    await expect(runEtl(prisma, dir)).rejects.toThrow(/Dataset file not found: .*vendor_data\.csv/);
  });
});
