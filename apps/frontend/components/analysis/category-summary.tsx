'use client';

import { useCategorySummary, type GroupKpis } from '@/lib/analysis';
import { formatDecimal, formatEur, formatInteger } from '@/lib/format';

const ROWS: { title: string; get: (k: GroupKpis) => number | null; format: (v: number | null) => string }[] = [
  { title: 'Items', get: (k) => k.itemCount, format: formatInteger },
  { title: 'Stock Value', get: (k) => k.stockValue, format: formatEur },
  { title: 'Excess Stock', get: (k) => k.excessStockValue, format: formatEur },
  { title: 'Inventory Availability', get: (k) => k.inventoryAvailabilityPct, format: (v) => (v === null ? '–' : `${formatDecimal(v)} %`) },
  { title: 'Items below minimum', get: (k) => k.belowMinimumCount, format: formatInteger },
  { title: 'Average autonomy', get: (k) => k.averageAutonomyDays, format: (v) => (v === null ? '–' : `${formatDecimal(v)} d`) },
];

/** Consumables vs Equipment side by side, with the previous period under each figure. */
export function CategorySummary({ query }: { query: string }) {
  const { data, isPending, error } = useCategorySummary(query);
  return (
    <section aria-label="Category summary" className="rounded-lg border bg-background">
      <h2 className="border-b px-3 py-2 text-sm font-medium">Category summary</h2>
      {isPending && <p className="p-3 text-sm text-muted-foreground">Loading…</p>}
      {error && (
        <p role="alert" className="p-3 text-sm text-destructive">
          {error.message}
        </p>
      )}
      {data &&
        (data.groups.length === 0 ? (
          <p className="p-3 text-sm text-muted-foreground">No Items for these filters.</p>
        ) : (
          <>
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr className="text-left">
                  <th className="px-3 py-1.5 font-normal" />
                  {data.groups.map((g) => (
                    <th key={g.key} className="px-3 py-1.5 text-right font-medium text-foreground">
                      {g.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {ROWS.map((row) => (
                  <tr key={row.title}>
                    <td className="px-3 py-1.5 text-muted-foreground">{row.title}</td>
                    {data.groups.map((g) => (
                      <td key={g.key} className="px-3 py-1.5 text-right tabular-nums">
                        {row.format(row.get(g.current))}
                        <div className="text-xs text-muted-foreground">{g.previous ? row.format(row.get(g.previous)) : '–'}</div>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="px-3 py-2 text-xs text-muted-foreground">Small figures under each value: previous period.</p>
          </>
        ))}
    </section>
  );
}
