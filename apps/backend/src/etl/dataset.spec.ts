import * as fs from 'node:fs';
import * as path from 'node:path';
import { DatasetValidationError, parseInventoryCsv, parseVendorCsv } from './dataset';

const fixtureDir = path.join(__dirname, '../../test/fixtures/basic');
const inventoryText = fs.readFileSync(path.join(fixtureDir, 'inventory_data.csv'), 'utf8');
const vendorText = fs.readFileSync(path.join(fixtureDir, 'vendor_data.csv'), 'utf8');
const HEADER =
  'Date,Item_ID,Item_Type,Item_Name,Current_Stock,Min_Required,Max_Capacity,Unit_Cost,Avg_Usage_Per_Day,Restock_Lead_Time,Vendor_ID';

describe('parseInventoryCsv', () => {
  it('reads every row unchanged, including anomalous ones', () => {
    const rows = parseInventoryCsv(inventoryText);
    expect(rows).toHaveLength(5);
    expect(rows[1]).toMatchObject({
      date: new Date('2025-01-03T00:00:00Z'),
      sourceItemId: 101,
      itemName: 'Surgical Mask',
      category: 'Equipment',
      vendorCode: 'V002',
      currentStock: 1200,
      minRequired: 100,
      maxCapacity: 1000,
      unitCost: '0.75',
      avgUsagePerDay: '40',
      restockLeadTime: 6,
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

  it('accepts Windows line endings and a byte-order mark', () => {
    const rows = parseInventoryCsv('﻿' + inventoryText.replace(/\n/g, '\r\n'));
    expect(rows).toHaveLength(5);
  });

  it('rejects a file with a missing column, naming it', () => {
    const text = inventoryText.replace('Restock_Lead_Time', 'Lead');
    expect(() => parseInventoryCsv(text)).toThrow(/missing column\(s\): Restock_Lead_Time/);
  });

  it('rejects invalid values with their line and column', () => {
    const text = `${HEADER}\n2025-02-30,101,Consumable,Mask,-5,1,2,abc,1,1,V001\n`;
    let error: DatasetValidationError | undefined;
    try {
      parseInventoryCsv(text);
    } catch (e) {
      error = e as DatasetValidationError;
    }
    expect(error).toBeInstanceOf(DatasetValidationError);
    expect(error!.problems).toEqual([
      'line 2, Date: expected a date as YYYY-MM-DD, got "2025-02-30"',
      'line 2, Current_Stock: expected a non-negative whole number, got "-5"',
      'line 2, Unit_Cost: expected a non-negative number, got "abc"',
    ]);
  });

  it('rejects two Snapshots of the same Item on the same date', () => {
    const row = '2025-01-01,101,Consumable,Mask,5,1,10,1.00,1,1,V001';
    expect(() => parseInventoryCsv(`${HEADER}\n${row}\n${row}\n`)).toThrow(/line 3: duplicate Snapshot/);
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
