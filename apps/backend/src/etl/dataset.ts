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
  // Numbers are kept as the exact text of the CSV so no digit is lost on the way to the database.
  currentStock: string;
  minRequired: string;
  maxCapacity: string;
  unitCost: string;
  avgUsagePerDay: string;
  /** Replenishment Time in days, from the `Restock_Lead_Time` column. */
  replenishmentTimeDays: string;
  // Data Quality Flags.
  stockAboveMaxCapacity: boolean;
  minAboveMax: boolean;
  negativeValue: boolean;
  nonIntegerQuantity: boolean;
  duplicateSnapshot: boolean;
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

const DECIMAL = /^-?\d+(\.\d+)?$/;

/** A decimal written as text, split so it can be compared exactly (no floating-point rounding). */
interface DecimalParts {
  negative: boolean;
  /** Integer digits without leading zeros. */
  whole: string;
  /** Fraction digits without trailing zeros. */
  fraction: string;
}

function decimalParts(value: string): DecimalParts {
  const [whole, fraction = ''] = value.replace(/^-/, '').split('.');
  const parts = { whole: whole.replace(/^0+/, ''), fraction: fraction.replace(/0+$/, '') };
  const isZero = parts.whole === '' && parts.fraction === '';
  return { negative: value.startsWith('-') && !isZero, ...parts };
}

/** Exact comparison of two decimals written as text: negative, zero or positive like `a - b`. */
export function compareDecimals(a: string, b: string): number {
  const x = decimalParts(a);
  const y = decimalParts(b);
  if (x.negative !== y.negative) return x.negative ? -1 : 1;
  // Digit strings of equal length compare correctly as plain strings.
  const compareDigits = (p: string, q: string) => (p < q ? -1 : p > q ? 1 : 0);
  let magnitude = x.whole.length - y.whole.length;
  if (magnitude === 0) magnitude = compareDigits(x.whole, y.whole);
  if (magnitude === 0) {
    const length = Math.max(x.fraction.length, y.fraction.length);
    magnitude = compareDigits(x.fraction.padEnd(length, '0'), y.fraction.padEnd(length, '0'));
  }
  return x.negative ? -Math.sign(magnitude) : Math.sign(magnitude);
}

const isNegative = (value: string) => decimalParts(value).negative;
const isWholeNumber = (value: string) => decimalParts(value).fraction === '';

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

  /** For identifiers and vendor reference data, which are stored as whole numbers. */
  int(column: string): number {
    const value = this.record[column] ?? '';
    if (!/^-?\d+$/.test(value)) {
      this.fail(column, 'a whole number');
      return 0;
    }
    return Number(value);
  }

  /** Any plain decimal number, returned as its exact text. Negative and non-integer values are allowed. */
  decimal(column: string): string {
    const value = this.record[column] ?? '';
    if (!DECIMAL.test(value)) {
      this.fail(column, 'a number');
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

/**
 * Parses the inventory CSV. Every row is kept with its values exactly as written: inconsistent values
 * (negative, non-integer quantities, duplicates, stock above capacity, minimum above maximum) are
 * flagged, never rejected or corrected. Only values that cannot be stored at all are rejected:
 * a missing column, an empty field, text where a number or date is expected, or an Item_ID that is
 * not a whole number (it identifies the Item, ADR 0001).
 */
export function parseInventoryCsv(text: string, file = INVENTORY_FILE): SnapshotRow[] {
  const records = readRecords(text, file, INVENTORY_COLUMNS);
  const problems: string[] = [];

  const rows = records.map((record, index) => {
    const r = new RowReader(record, index + 2, problems);
    const row: SnapshotRow = {
      line: r.line,
      date: r.date('Date'),
      sourceItemId: r.int('Item_ID'),
      itemName: r.text('Item_Name'),
      category: r.text('Item_Type'),
      vendorCode: r.text('Vendor_ID'),
      currentStock: r.decimal('Current_Stock'),
      minRequired: r.decimal('Min_Required'),
      maxCapacity: r.decimal('Max_Capacity'),
      unitCost: r.decimal('Unit_Cost'),
      avgUsagePerDay: r.decimal('Avg_Usage_Per_Day'),
      replenishmentTimeDays: r.decimal('Restock_Lead_Time'),
      stockAboveMaxCapacity: false,
      minAboveMax: false,
      negativeValue: false,
      nonIntegerQuantity: false,
      duplicateSnapshot: false,
    };
    const quantities = [row.currentStock, row.minRequired, row.maxCapacity, row.replenishmentTimeDays];
    row.stockAboveMaxCapacity = compareDecimals(row.currentStock, row.maxCapacity) > 0;
    row.minAboveMax = compareDecimals(row.minRequired, row.maxCapacity) > 0;
    row.negativeValue = [...quantities, row.unitCost, row.avgUsagePerDay].some(isNegative);
    // Cost and average usage are naturally decimal; stock, thresholds and lead time are counts of units or days.
    row.nonIntegerQuantity = !quantities.every(isWholeNumber);
    return row;
  });

  const rowsBySnapshotKey = new Map<string, SnapshotRow[]>();
  for (const row of rows) {
    const key = `${itemKey(row.sourceItemId, row.itemName)}|${row.date.toISOString()}`;
    rowsBySnapshotKey.set(key, [...(rowsBySnapshotKey.get(key) ?? []), row]);
  }
  for (const group of rowsBySnapshotKey.values()) {
    if (group.length > 1) for (const row of group) row.duplicateSnapshot = true;
  }

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
