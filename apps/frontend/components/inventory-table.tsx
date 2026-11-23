'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { formatDecimal, formatEur, formatInteger } from '@/lib/format';
import { nextSort, searchItems, sortItems, type Sort, type SortKey } from '@/lib/inventory-table';
import { EMPTY_FILTERS, withFilters, type Filters } from '@/lib/filters';
import type { ItemRow, StockStatus, UrgencyLevel } from '@/lib/items';
import { cn } from '@/lib/utils';

const COLUMNS: { key: SortKey; label: string; numeric?: boolean }[] = [
  { key: 'name', label: 'Item' },
  { key: 'category', label: 'Category' },
  { key: 'vendor', label: 'Vendor' },
  { key: 'currentStock', label: 'Stock', numeric: true },
  { key: 'minRequired', label: 'Min', numeric: true },
  { key: 'maxCapacity', label: 'Max', numeric: true },
  { key: 'autonomy', label: 'Autonomy (days)', numeric: true },
  { key: 'turnover', label: 'Turnover (/yr)', numeric: true },
  { key: 'replenishment', label: 'Replenishment (days)', numeric: true },
  { key: 'stockValue', label: 'Stock Value', numeric: true },
  { key: 'abcClass', label: 'ABC' },
  { key: 'stockStatus', label: 'Stock Status' },
  { key: 'urgency', label: 'Urgency' },
];

const STATUS_LABEL: Record<StockStatus, string> = {
  BELOW_MINIMUM: 'Below Minimum',
  REORDER_NEEDED: 'Reorder Needed',
  EXCESS: 'Excess',
  NORMAL: 'Normal',
};

const URGENCY: Record<UrgencyLevel, { label: string; className: string }> = {
  CRITICAL: { label: 'Critical', className: 'bg-critical/10 text-critical ring-critical/30' },
  ATTENTION: { label: 'Attention', className: 'bg-attention/10 text-attention ring-attention/30' },
  NORMAL: { label: 'Normal', className: 'bg-normal/10 text-normal ring-normal/30' },
};

/** The Item table. Takes the (already filtered) Items as a prop so filters can be added upstream. */
export function InventoryTable({ items, filters = EMPTY_FILTERS }: { items: ItemRow[]; filters?: Filters }) {
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<Sort>({ key: 'name', direction: 'asc' });
  const rows = useMemo(() => sortItems(searchItems(items, search), sort), [items, search, sort]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <Input
          type="search"
          aria-label="Search Items"
          placeholder="Search by Item name or ID"
          className="max-w-xs"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          {rows.length} of {items.length} Items
        </p>
      </div>
      <div className="overflow-x-auto rounded-lg border bg-background">
        <table className="w-full text-xs">
          <thead className="bg-muted text-muted-foreground">
            <tr>
              {COLUMNS.map((col) => {
                const active = sort.key === col.key;
                const Icon = !active ? ArrowUpDown : sort.direction === 'asc' ? ArrowUp : ArrowDown;
                return (
                  <th
                    key={col.key}
                    scope="col"
                    aria-sort={active ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'}
                    className={cn('whitespace-nowrap px-2 py-1.5 font-medium', col.numeric ? 'text-right' : 'text-left')}
                  >
                    <button
                      type="button"
                      onClick={() => setSort((current) => nextSort(current, col.key))}
                      className={cn('inline-flex items-center gap-1 hover:text-foreground', active && 'text-foreground')}
                    >
                      {col.label}
                      <Icon className={cn('size-3', !active && 'opacity-40')} aria-hidden />
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((item) => (
              <ItemRowView filters={filters} key={item.id} item={item} />
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={COLUMNS.length} className="px-3 py-8 text-center text-muted-foreground">
                  No Items match your search.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ItemRowView({ item, filters }: { item: ItemRow; filters: Filters }) {
  const below = item.belowMinimum === true;
  const urgency = item.urgencyLevel ? URGENCY[item.urgencyLevel] : null;
  return (
    <tr className={cn('hover:bg-accent', below && 'bg-critical/5 shadow-[inset_3px_0_0_var(--urgency-critical)]')}>
      <td className="px-2 py-1.5">
        {/* Ticket 08 adds the /inventory/[id] route this links to. */}
        <Link href={withFilters(`/inventory/${item.id}`, filters)} className="font-medium text-accent-foreground hover:underline">
          {item.name}
        </Link>
        <span className="ml-1.5 text-muted-foreground">#{item.sourceItemId}</span>
        {item.lowTurnover && (
          <span
            title="Low-Turnover Item: stock turns over less often than the configured threshold"
            className="ml-1.5 rounded bg-muted px-1 py-0.5 text-[10px] font-medium text-muted-foreground ring-1 ring-border"
          >
            Low turnover
          </span>
        )}
      </td>
      <td className="px-2 py-1.5">{item.category}</td>
      <td className="px-2 py-1.5">{item.vendorName}</td>
      <td className={cn('px-2 py-1.5 text-right tabular-nums', below && 'font-semibold')}>{formatInteger(item.state?.currentStock)}</td>
      <td className="px-2 py-1.5 text-right tabular-nums">{formatInteger(item.state?.minRequired)}</td>
      <td className="px-2 py-1.5 text-right tabular-nums">{formatInteger(item.state?.maxCapacity)}</td>
      <td className="px-2 py-1.5 text-right tabular-nums">{item.hasState && item.stockAutonomyDays === null ? '∞' : formatDecimal(item.stockAutonomyDays)}</td>
      <td className="px-2 py-1.5 text-right tabular-nums">{formatDecimal(item.stockTurnover)}</td>
      <td className="px-2 py-1.5 text-right tabular-nums">{formatDecimal(item.replenishmentTimeDays)}</td>
      <td className="px-2 py-1.5 text-right tabular-nums">{formatEur(item.stockValue)}</td>
      <td className="px-2 py-1.5">{item.abcClass ?? '–'}</td>
      <td className={cn('px-2 py-1.5', below && 'font-semibold text-critical')}>
        {item.stockStatus ? STATUS_LABEL[item.stockStatus] : '–'}
      </td>
      <td className="px-2 py-1.5">
        {urgency ? (
          <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium ring-1', urgency.className)}>{urgency.label}</span>
        ) : (
          '–'
        )}
      </td>
    </tr>
  );
}
