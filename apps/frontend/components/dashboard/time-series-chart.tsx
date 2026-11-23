'use client';

import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { SeriesData, SeriesPoint } from '@/lib/charts';
import { formatDecimal, formatEur } from '@/lib/format';

export type SeriesMetric = 'stockValue' | 'consumptionValue' | 'inventoryAvailabilityPct';

const METRICS: Record<SeriesMetric, { title: string; format: (v: number | null) => string }> = {
  stockValue: { title: 'Stock Value over time', format: (v) => formatEur(v) },
  consumptionValue: { title: 'Consumption over time (value per day)', format: (v) => formatEur(v) },
  inventoryAvailabilityPct: { title: 'Inventory Availability (daily)', format: (v) => (v === null ? '–' : `${formatDecimal(v)} %`) },
};

interface Row {
  offset: number;
  currentDate: string;
  previousDate?: string;
  current: number | null;
  previous: number | null;
}

/** Joins the two periods by day offset, so the previous period is drawn over the current one. */
function rowsOf(data: SeriesData, metric: SeriesMetric): Row[] {
  const prevByOffset = new Map<number, SeriesPoint>(data.previous.map((p) => [p.offset, p]));
  return data.current.map((p) => ({
    offset: p.offset,
    currentDate: p.date,
    previousDate: prevByOffset.get(p.offset)?.date,
    current: p[metric],
    previous: prevByOffset.get(p.offset)?.[metric] ?? null,
  }));
}

/** A line chart of one series for the current period, with the previous period dashed and muted underneath. */
export function TimeSeriesChart({
  metric,
  data,
  isPending,
  error,
}: {
  metric: SeriesMetric;
  data: SeriesData | undefined;
  isPending: boolean;
  error: Error | null;
}) {
  const { title, format } = METRICS[metric];
  const rows = data ? rowsOf(data, metric) : [];
  const hasPrevious = (data?.previous.length ?? 0) > 0;

  return (
    <section aria-label={title} className="rounded-lg border bg-background">
      <h2 className="border-b px-3 py-2 text-sm font-medium">{title}</h2>
      <div className="h-64 p-3">
        {isPending && <p className="text-sm text-muted-foreground">Loading…</p>}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error.message}
          </p>
        )}
        {data &&
          (rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No data for this period.</p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={rows} margin={{ top: 4, right: 8, bottom: 0, left: 8 }}>
                <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="offset"
                  tickFormatter={(o: number) => rows[o]?.currentDate.slice(5) ?? ''}
                  tick={{ fontSize: 11, fill: '#64748b' }}
                  minTickGap={24}
                />
                <YAxis
                  width={64}
                  tick={{ fontSize: 11, fill: '#64748b' }}
                  tickFormatter={(v: number) => new Intl.NumberFormat('pt-PT', { notation: 'compact', maximumFractionDigits: 1 }).format(v)}
                  domain={metric === 'inventoryAvailabilityPct' ? [0, 100] : ['auto', 'auto']}
                />
                <Tooltip
                  formatter={(value, name) => [format(value as number | null), name]}
                  labelFormatter={(o) => {
                    const row = rows[Number(o)];
                    return row ? `${row.currentDate}${row.previousDate ? ` (previous: ${row.previousDate})` : ''}` : '';
                  }}
                />
                <Legend />
                {hasPrevious && (
                  <Line
                    name="Previous period"
                    dataKey="previous"
                    stroke="#94a3b8"
                    strokeWidth={1.5}
                    strokeDasharray="5 4"
                    dot={false}
                    connectNulls
                    isAnimationActive={false}
                  />
                )}
                <Line name="Period" dataKey="current" stroke="#0d9488" strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          ))}
      </div>
    </section>
  );
}
