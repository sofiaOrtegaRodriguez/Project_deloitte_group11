import type { ItemRow } from './items';

export type SortKey =
  | 'name'
  | 'category'
  | 'vendor'
  | 'currentStock'
  | 'minRequired'
  | 'maxCapacity'
  | 'autonomy'
  | 'turnover'
  | 'replenishment'
  | 'abcClass'
  | 'stockStatus'
  | 'urgency'
  | 'stockValue';

export type SortDirection = 'asc' | 'desc';
export interface Sort {
  key: SortKey;
  direction: SortDirection;
}

const URGENCY_ORDER = { CRITICAL: 0, ATTENTION: 1, NORMAL: 2 } as const;
const STATUS_ORDER = { BELOW_MINIMUM: 0, REORDER_NEEDED: 1, EXCESS: 2, NORMAL: 3 } as const;

type SortValue = string | number | null;

function sortValue(item: ItemRow, key: SortKey): SortValue {
  switch (key) {
    case 'name': return item.name;
    case 'category': return item.category;
    case 'vendor': return item.vendorName;
    case 'currentStock': return item.state?.currentStock ?? null;
    case 'minRequired': return item.state?.minRequired ?? null;
    case 'maxCapacity': return item.state?.maxCapacity ?? null;
    case 'autonomy': return item.stockAutonomyDays;
    case 'turnover': return item.stockTurnover;
    case 'replenishment': return item.replenishmentTimeDays;
    case 'abcClass': return item.abcClass;
    case 'stockStatus': return item.stockStatus ? STATUS_ORDER[item.stockStatus] : null;
    case 'urgency': return item.urgencyLevel ? URGENCY_ORDER[item.urgencyLevel] : null;
    case 'stockValue': return item.stockValue;
  }
}

function compareValues(a: string | number, b: string | number): number {
  if (typeof a === 'string' && typeof b === 'string') return a.localeCompare(b, 'en', { numeric: true, sensitivity: 'base' });
  return (a as number) - (b as number);
}

/** Sorted copy. Missing values (null) always go last, whichever the direction. Ties fall back to Item name, then id. */
export function sortItems(items: readonly ItemRow[], sort: Sort): ItemRow[] {
  const sign = sort.direction === 'asc' ? 1 : -1;
  return [...items].sort((x, y) => {
    const a = sortValue(x, sort.key);
    const b = sortValue(y, sort.key);
    if (a === null && b !== null) return 1;
    if (b === null && a !== null) return -1;
    if (a !== null && b !== null) {
      const result = compareValues(a, b);
      if (result !== 0) return sign * result;
    }
    return x.name.localeCompare(y.name, 'en', { numeric: true }) || x.id - y.id;
  });
}

/** Items whose name contains the text, or whose source Item ID starts with it. Case-insensitive; blank text keeps everything. */
export function searchItems(items: readonly ItemRow[], text: string): ItemRow[] {
  const q = text.trim().toLowerCase();
  if (!q) return [...items];
  return items.filter((i) => i.name.toLowerCase().includes(q) || String(i.sourceItemId).startsWith(q));
}

/** The direction a column starts in when first clicked: text and severity ascending, numbers descending. */
export function defaultDirection(key: SortKey): SortDirection {
  return ['name', 'category', 'vendor', 'abcClass', 'stockStatus', 'urgency'].includes(key) ? 'asc' : 'desc';
}

/** Clicking the active column flips its direction; clicking another starts in its default direction. */
export function nextSort(current: Sort, key: SortKey): Sort {
  if (current.key === key) return { key, direction: current.direction === 'asc' ? 'desc' : 'asc' };
  return { key, direction: defaultDirection(key) };
}
