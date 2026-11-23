'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useConsumptionTrends, type TrendingItem } from '@/lib/analysis';
import { withFilters, type Filters } from '@/lib/filters';
import { formatDecimal } from '@/lib/format';

function TrendList({ title, items, filters, empty }: { title: string; items: TrendingItem[]; filters: Filters; empty: string }) {
  return (
    <div>
      <h3 className="px-3 py-1.5 text-xs font-medium text-muted-foreground">{title}</h3>
      {items.length === 0 ? (
        <p className="px-3 pb-3 text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="divide-y">
          {items.map((item) => (
            <li key={item.itemId} data-testid="trending-item" className="flex items-center justify-between gap-3 px-3 py-1.5 text-sm hover:bg-muted">
              <span>
                <Link href={withFilters(`/inventory/${item.itemId}`, filters)} className="font-medium hover:underline">
                  {item.name}
                </Link>
                <span className="ml-2 text-xs text-muted-foreground">
                  {item.category} · min {formatDecimal(item.minRequired)} / max {formatDecimal(item.maxCapacity)}
                </span>
              </span>
              <span className="tabular-nums">
                {item.trendPct > 0 ? '+' : ''}
                {formatDecimal(item.trendPct)} %
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Items whose consumption rose or fell between the two halves of the period: candidates for a threshold review
 * (which Items have trends that should change their thresholds?).
 */
export function ConsumptionTrends({ query, filters }: { query: string; filters: Filters }) {
  const [minPct, setMinPct] = useState(10);
  const [top, setTop] = useState(10);
  const { data, isPending, error } = useConsumptionTrends(query, minPct, top);

  return (
    <section aria-label="Consumption trends" className="rounded-lg border bg-background">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2">
        <h2 className="text-sm font-medium">Consumption trends</h2>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <label className="flex items-center gap-1">
            Minimum change (%)
            <input
              type="number"
              min={0}
              value={minPct}
              onChange={(e) => setMinPct(Math.max(0, Number(e.target.value) || 0))}
              className="w-16 rounded border px-1.5 py-0.5 text-foreground"
            />
          </label>
          <label className="flex items-center gap-1">
            Top
            <input
              type="number"
              min={1}
              max={100}
              value={top}
              onChange={(e) => setTop(Math.min(100, Math.max(1, Math.round(Number(e.target.value)) || 1)))}
              className="w-14 rounded border px-1.5 py-0.5 text-foreground"
            />
          </label>
        </div>
      </div>
      {isPending && <p className="p-3 text-sm text-muted-foreground">Loading…</p>}
      {error && (
        <p role="alert" className="p-3 text-sm text-destructive">
          {error.message}
        </p>
      )}
      {data && (
        <div className="grid divide-y md:grid-cols-2 md:divide-x md:divide-y-0">
          <TrendList title="Rising consumption" items={data.rising} filters={filters} empty="No Item rising above the threshold." />
          <TrendList title="Falling consumption" items={data.falling} filters={filters} empty="No Item falling below the threshold." />
        </div>
      )}
    </section>
  );
}
