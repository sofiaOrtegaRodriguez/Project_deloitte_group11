import * as fs from 'node:fs';
import * as path from 'node:path';
import { DatasetValidationError, parseInventoryCsv, parseVendorCsv, type SnapshotRow } from './dataset';

const fixtureDir = path.join(__dirname, '../../test/fixtures/basic');
const inventoryText = fs.readFileSync(path.join(fixtureDir, 'inventory_data.csv'), 'utf8');
const vendorText = fs.readFileSync(path.join(fixtureDir, 'vendor_data.csv'), 'utf8');
const HEADER =
  'Date,Item_ID,Item_Type,Item_Name,Current_Stock,Min_Required,Max_Capacity,Unit_Cost,Avg_Usage_Per_Day,Restock_Lead_Time,Vendor_ID';

const parseRows = (...rows: string[]) => parseInventoryCsv(`${HEADER}\n${rows.join('\n')}\n`);

const flagsOf = (row: SnapshotRow) => ({
  stockAboveMaxCapacity: row.stockAboveMaxCapacity,
  minAboveMax: row.minAboveMax,
  negativeValue: row.negativeValue,
  nonIntegerQuantity: row.nonIntegerQuantity,
  duplicateSnapshot: row.duplicateSnapshot,
});

const NO_FLAGS = {
  stockAboveMaxCapacity: false,
  minAboveMax: false,
  negativeValue: false,
  nonIntegerQuantity: false,
  duplicateSnapshot: false,
};

function validationProblems(fn: () => unknown): string[] {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(DatasetValidationError);
    return (error as DatasetValidationError).problems;
  }
  throw new Error('expected a DatasetValidationError');
}

describe('parseInventoryCsv', () => {
  it('reads every row with its values exactly as written', () => {
    const rows = parseInventoryCsv(inventoryText);
    expect(rows).toHaveLength(5);
    expect(rows[1]).toMatchObject({
      date: new Date('2025-01-03T00:00:00Z'),
      sourceItemId: 101,
      itemName: 'Surgical Mask',
      category: 'Equipment',
      vendorCode: 'V002',
      currentStock: '1200',
      minRequired: '100',
      maxCapacity: '1000',
      unitCost: '0.75',
      avgUsagePerDay: '40',
      replenishmentTimeDays: '6',
    });
  });

  it('flags stock above Max Capacity and minimum above maximum', () => {
    const flags = parseInventoryCsv(inventoryText).map((r) => [r.stockAboveMaxCapacity, r.minAboveMax]);
    expect(flags).toEqual([
      [false, false], // 500 ≤ 1000
      [true, false], // 1200 > 1000
      [false, true], // min 30 > max 25
      [false, false],
      [false, false],
    ]);
  });

  it('compares decimals exactly when flagging', () => {
    const [barelyAbove, equal] = parseRows(
      '2025-01-01,101,Consumable,Mask,1000.0000000000000001,1,1000,1,1,1,V001',
      '2025-01-02,101,Consumable,Mask,1000.000,1000,1000.0,1,1,1,V001',
    );
    expect(barelyAbove.stockAboveMaxCapacity).toBe(true);
    expect(flagsOf(equal)).toEqual(NO_FLAGS);
  });

  it('keeps every decimal digit, without rounding', () => {
    const [row] = parseRows('2025-01-01,101,Consumable,Mask,5,1,10,4467.555,12.3456789,7.25,V001');
    expect(row).toMatchObject({ unitCost: '4467.555', avgUsagePerDay: '12.3456789', replenishmentTimeDays: '7.25' });
  });

  it('loads negative values unchanged and flags them', () => {
    const rows = parseRows(
      '2025-01-01,101,Consumable,Mask,-5,1,10,1.00,1,1,V001',
      '2025-01-02,101,Consumable,Mask,5,1,10,-1.50,1,1,V001',
      '2025-01-03,101,Consumable,Mask,5,1,10,1.00,-2,1,V001',
      '2025-01-04,101,Consumable,Mask,5,1,10,1.00,1,-3,V001',
    );
    expect(rows.map((r) => r.negativeValue)).toEqual([true, true, true, true]);
    expect(rows.map((r) => [r.currentStock, r.unitCost, r.avgUsagePerDay, r.replenishmentTimeDays])).toEqual([
      ['-5', '1.00', '1', '1'],
      ['5', '-1.50', '1', '1'],
      ['5', '1.00', '-2', '1'],
      ['5', '1.00', '1', '-3'],
    ]);
  });

  it('loads non-integer stock, thresholds and Replenishment Time unchanged and flags them', () => {
    const rows = parseRows(
      '2025-01-01,101,Consumable,Mask,5.5,1,10,1,1,1,V001',
      '2025-01-02,101,Consumable,Mask,5,1.5,10,1,1,1,V001',
      '2025-01-03,101,Consumable,Mask,5,1,10.5,1,1,1,V001',
      '2025-01-04,101,Consumable,Mask,5,1,10,1,1,2.5,V001',
      '2025-01-05,101,Consumable,Mask,5,1,10,1.25,0.5,1,V001', // decimals are normal for cost and average usage
    );
    expect(rows.map((r) => r.nonIntegerQuantity)).toEqual([true, true, true, true, false]);
    expect(rows[0].currentStock).toBe('5.5');
  });

  it('loads duplicate Snapshots of the same Item and date, and flags every copy', () => {
    const rows = parseRows(
      '2025-01-01,101,Consumable,Mask,5,1,10,1.00,1,1,V001',
      '2025-01-01,101,Equipment,Mask,6,1,10,1.00,1,1,V002',
      '2025-01-01,102,Consumable,Mask,5,1,10,1.00,1,1,V001', // different Item
      '2025-01-02,101,Consumable,Mask,5,1,10,1.00,1,1,V001', // different date
    );
    expect(rows).toHaveLength(4);
    expect(rows.map((r) => r.duplicateSnapshot)).toEqual([true, true, false, false]);
  });

  it('sets no flag on a consistent row', () => {
    const [row] = parseRows('2025-01-01,101,Consumable,Mask,5,1,10,1.00,1,1,V001');
    expect(flagsOf(row)).toEqual(NO_FLAGS);
  });

  it('accepts Windows line endings and a byte-order mark', () => {
    const rows = parseInventoryCsv('﻿' + inventoryText.replace(/\n/g, '\r\n'));
    expect(rows).toHaveLength(5);
  });

  it('rejects a file with a missing column, naming it', () => {
    const text = inventoryText.replace('Restock_Lead_Time', 'Lead');
    expect(() => parseInventoryCsv(text)).toThrow(/missing column\(s\): Restock_Lead_Time/);
  });

  it('rejects only values that cannot be stored at all, with their line and column', () => {
    const problems = validationProblems(() =>
      parseRows('2025-02-30,10.5,Consumable,,-5,1,2,abc,1,1,V001', '2025-01-01,101,Consumable,Mask,5,1,10,1,1,1,'),
    );
    expect(problems).toEqual([
      'line 2, Date: expected a date as YYYY-MM-DD, got "2025-02-30"',
      'line 2, Item_ID: expected a whole number, got "10.5"',
      'line 2, Item_Name: expected a value, got ""',
      'line 2, Unit_Cost: expected a number, got "abc"',
      'line 3, Vendor_ID: expected a value, got ""',
    ]);
  });

  it('rejects a file with no data rows', () => {
    expect(() => parseInventoryCsv(`${HEADER}\n`)).toThrow(/no data rows/);
  });
});

describe('parseVendorCsv', () => {
  it('keeps only the vendor name and Contracted Lead Time', () => {
    expect(parseVendorCsv(vendorText)).toEqual([
      { code: 'V001', name: 'MedSupplies Inc.', contractedLeadTimeDays: 5 },
      { code: 'V002', name: 'EquipMed Co.', contractedLeadTimeDays: 30 },
      { code: 'V003', name: 'HealthTools Ltd.', contractedLeadTimeDays: 15 },
    ]);
  });

  it('rejects a duplicate Vendor_ID', () => {
    const text = 'Vendor_ID,Vendor_Name,Avg_Lead_Time (days)\nV001,A,5\nV001,B,6\n';
    expect(() => parseVendorCsv(text)).toThrow(/duplicate Vendor_ID "V001"/);
  });
});
