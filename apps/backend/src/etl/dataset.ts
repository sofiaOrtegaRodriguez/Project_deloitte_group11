// Pure parsing and validation of the source CSVs. No I/O: callers pass the file contents.
// Rows are never dropped or corrected; anomalies become Data Quality Flags (ADR 0002).
import { parse } from 'csv-parse/sync';

export const INVENTORY_FILE = 'inventory_data.csv';
export const VENDOR_FILE = 'vendor_data.csv';

export const INVENTORY_COLUMNS = [
  'Date',
  'Item_ID',
  'Item_Type',
  'Item_Name',
  'Current_Stock',
  'Min_Required',
  'Max_Capacity',
  'Unit_Cost',
  'Avg_Usage_Per_Day',
  'Restock_Lead_Time',
  'Vendor_ID',
] as const;

/** Only the vendor name and Contracted Lead Time are used; other columns are ignored (ADR 0002). */
export const VENDOR_COLUMNS = ['Vendor_ID', 'Vendor_Name', 'Avg_Lead_Time (days)'] as const;

export interface SnapshotRow {
  /** 1-based line number in the CSV, for error messages. */
  line: number;
  /** Midnight UTC of the Snapshot date. */
  date: Date;
  sourceItemId: number;
  itemName: string;
  category: string;
  vendorCode: string;
  currentStock: number;
  minRequired: number;
  maxCapacity: number;
  /** Decimal kept as text so no precision is lost on the way to the database. */
  unitCost: string;
  avgUsagePerDay: string;
  restockLeadTime: number;
  stockAboveMaxCapacity: boolean;
  minAboveMax: boolean;
}

export interface VendorRow {
  code: string;
  name: string;
  contractedLeadTimeDays: number;
}

export class DatasetValidationError extends Error {
  constructor(
    readonly file: string,
    readonly problems: string[],
  ) {
    const shown = problems.slice(0, 20);
    const more = problems.length > shown.length ? `\n  … and ${problems.length - shown.length} more` : '';
    super(`${file} is not valid:\n  ${shown.join('\n  ')}${more}`);
    this.name = 'DatasetValidationError';
  }
}

/** Natural key of an Item (ADR 0001). */
export function itemKey(sourceItemId: number, name: string): string {
  return `${sourceItemId}|${name}`;
}

type RawRecord = Record<string, string>;

function readRecords(text: string, file: string, required: readonly string[]): RawRecord[] {
  let records: RawRecord[];
  try {
    records = parse(text, { columns: true, bom: true, trim: true, skip_empty_lines: true }) as RawRecord[];
  } catch (error) {
    throw new DatasetValidationError(file, [(error as Error).message]);
  }
  const header = text.replace(/^﻿/, '').split(/\r?\n/, 1)[0].split(',').map((c) => c.trim());
  const missing = required.filter((column) => !header.includes(column));
  if (missing.length > 0) {
    throw new DatasetValidationError(file, [`missing column(s): ${missing.join(', ')}`]);
  }
  return records;
}

class RowReader {
  constructor(
    private readonly record: RawRecord,
    readonly line: number,
    private readonly problems: string[],
  ) {}

  private fail(column: string, expected: string): void {
    this.problems.push(`line ${this.line}, ${column}: expected ${expected}, got "${this.record[column]}"`);
  }

  text(column: string): string {
    const value = this.record[column] ?? '';
    if (value === '') this.fail(column, 'a value');
    return value;
  }

  int(column: string): number {
    const value = this.record[column] ?? '';
    if (!/^\d+$/.test(value)) {
      this.fail(column, 'a non-negative whole number');
      return 0;
    }
    return Number(value);
  }

  decimal(column: string): string {
    const value = this.record[column] ?? '';
    if (!/^\d+(\.\d+)?$/.test(value)) {
      this.fail(column, 'a non-negative number');
      return '0';
    }
    return value;
  }

  date(column: string): Date {
    const value = this.record[column] ?? '';
    const date = new Date(`${value}T00:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
      this.fail(column, 'a date as YYYY-MM-DD');
      return new Date(0);
    }
    return date;
  }
}

export function parseInventoryCsv(text: string, file = INVENTORY_FILE): SnapshotRow[] {
  const records = readRecords(text, file, INVENTORY_COLUMNS);
  const problems: string[] = [];
  const seen = new Map<string, number>();

  const rows = records.map((record, index) => {
    const r = new RowReader(record, index + 2, problems);
    const row: SnapshotRow = {
      line: r.line,
      date: r.date('Date'),
      sourceItemId: r.int('Item_ID'),
      itemName: r.text('Item_Name'),
      category: r.text('Item_Type'),
      vendorCode: r.text('Vendor_ID'),
      currentStock: r.int('Current_Stock'),
      minRequired: r.int('Min_Required'),
      maxCapacity: r.int('Max_Capacity'),
      unitCost: r.decimal('Unit_Cost'),
      avgUsagePerDay: r.decimal('Avg_Usage_Per_Day'),
      restockLeadTime: r.int('Restock_Lead_Time'),
      stockAboveMaxCapacity: false,
      minAboveMax: false,
    };
    row.stockAboveMaxCapacity = row.currentStock > row.maxCapacity;
    row.minAboveMax = row.minRequired > row.maxCapacity;

    const key = `${itemKey(row.sourceItemId, row.itemName)}|${record.Date}`;
    const firstLine = seen.get(key);
    if (firstLine !== undefined) {
      problems.push(`line ${r.line}: duplicate Snapshot for the same Item and date as line ${firstLine}`);
    } else {
      seen.set(key, r.line);
    }
    return row;
  });

  if (rows.length === 0) problems.push('the file has no data rows');
  if (problems.length > 0) throw new DatasetValidationError(file, problems);
  return rows;
}

export function parseVendorCsv(text: string, file = VENDOR_FILE): VendorRow[] {
  const records = readRecords(text, file, VENDOR_COLUMNS);
  const problems: string[] = [];
  const seen = new Set<string>();

  const rows = records.map((record, index) => {
    const r = new RowReader(record, index + 2, problems);
    const row: VendorRow = {
      code: r.text('Vendor_ID'),
      name: r.text('Vendor_Name'),
      contractedLeadTimeDays: r.int('Avg_Lead_Time (days)'),
    };
    if (seen.has(row.code)) problems.push(`line ${r.line}: duplicate Vendor_ID "${row.code}"`);
    seen.add(row.code);
    return row;
  });

  if (problems.length > 0) throw new DatasetValidationError(file, problems);
  return rows;
}
