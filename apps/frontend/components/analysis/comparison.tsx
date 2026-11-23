'use client';

import { useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useCompare, type CompareBy, type GroupKpis, type GroupRow } from '@/lib/analysis';
import { formatDecimal, formatEur, formatInteger } from '@/lib/format';

const OPTIONS: { by: CompareBy; label: string }[] = [
  { by: 'category', label: 'Category' },
  { by: 'vendor', label: 'Vendor' },
  { by: 'abcClass', label: 'ABC Class' },
];

const COLUMNS: { title: string; get: (k: GroupKpis) => number | null; format: (v: number | null) => string }[] = [
  { title: 'Items', get: (k) => k.itemCount, format: formatInteger },
  { title: 'Stock Value', get: (k) => k.stockValue, format: formatEur },
  { title: 'Excess', get: (k) => k.excessStockValue, format: formatEur },
  { title: 'Availability', get: (k) => k.inventoryAvailabilityPct, format: (v) => (v === null ? '–' : `${formatDecimal(v)} %`) },
  { title: 'Median autonomy', get: (k) => k.medianAutonomyDays, format: (v) => (v === null ? '–' : `${formatDecimal(v)} d`) },
  { title: 'Turnover', get: (k) => k.weightedTurnover, format: (v) => (v === null ? '–' : `${formatDecimal(v)}x`) },
  { title: 'Replenishment', get: (k) => k.meanReplenishmentTimeDays, format: (v) => (v === null ? '–' : `${formatDecimal(v)} d`) },
  { title: 'Below min.', get: (k) => k.belowMinimumCount, format: formatInteger },
];

function ComparisonTable({ groups }: { groups: GroupRow[] }) {
  return (
    <table className="w-full text-sm">
      <thead className="text-xs text-muted-foreground">
        <tr className="text-left">
          <th className="px-3 py-1.5 font-normal">Group</th>
          {COLUMNS.map((c) => (
            <th key={c.title} className="px-3 py-1.5 text-right font-normal">
              {c.title}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y">
        {groups.map((g) => (
          <tr key={g.key} data-testid="comparison-row" className="align-top hover:bg-muted">
            <td className="px-3 py-1.5 font-medium">{g.label}</td>
            {COLUMNS.map((c) => (
              <td key={c.title} className="px-3 py-1.5 text-right tabular-nums">
                {c.format(c.get(g.current))}
                <div className="text-xs text-muted-foreground">{g.previous ? c.format(c.get(g.previous)) : '–'}</div>
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** KPIs per Category, Vendor or ABC Class: current period, with the previous period in small type underneath. */
export function Comparison({ query }: { query: string }) {
  const [by, setBy] = useState<CompareBy>('category');
  const { data, isPending, error } = useCompare(query, by);
  const chartRows = (data?.groups ?? []).map((g) => ({ label: g.label, current: g.current.stockValue, previous: g.previous?.stockValue ?? null }));

  return (
    <section aria-label="Comparison" className="rounded-lg border bg-background">
      <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
        <h2 className="text-sm font-medium">Comparison</h2>
        <div role="group" aria-label="Compare by" className="inline-flex overflow-hidden rounded-md border text-xs">
          {OPTIONS.map((o) => (
            <button
              key={o.by}
              type="button"
              aria-pressed={by === o.by}
              onClick={() => setBy(o.by)}
              className={`px-2.5 py-1 ${by === o.by ? 'bg-teal-600 text-white' : 'bg-background text-slate-600 hover:bg-muted'}`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>
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
            <div className="h-56 p-3" aria-label="Stock Value by group">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartRows} margin={{ top: 4, right: 8, bottom: 0, left: 8 }}>
                  <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} />
                  <YAxis
                    width={64}
                    tick={{ fontSize: 11, fill: '#64748b' }}
                    tickFormatter={(v: number) => new Intl.NumberFormat('pt-PT', { notation: 'compact', maximumFractionDigits: 1 }).format(v)}
                  />
                  <Tooltip formatter={(value, name) => [formatEur(value as number | null), name]} />
                  <Legend />
                  <Bar name="Previous period" dataKey="previous" fill="#94a3b8" isAnimationActive={false} />
                  <Bar name="Period" dataKey="current" fill="#0d9488" isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="overflow-x-auto">
              <ComparisonTable groups={data.groups} />
            </div>
            <p className="px-3 py-2 text-xs text-muted-foreground">Small figures under each value: previous period.</p>
          </>
        ))}
    </section>
  );
}
