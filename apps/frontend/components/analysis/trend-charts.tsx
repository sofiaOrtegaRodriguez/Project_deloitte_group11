'use client';

import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useTrends, type TrendPoint, type TrendsData } from '@/lib/analysis';
import { formatDecimal, formatEur, formatInteger } from '@/lib/format';

type Metric = Exclude<keyof TrendPoint, 'offset' | 'date'>;

const pct = (v: number | null) => (v === null ? '–' : `${formatDecimal(v)} %`);
const days = (v: number | null) => (v === null ? '–' : `${formatDecimal(v)} d`);

// One chart per indicator. Consumption value is not an indicator of its own (it feeds Stock Turnover) so it is not drawn.
const METRICS: { metric: Metric; title: string; format: (v: number | null) => string; percent?: boolean }[] = [
  { metric: 'stockValue', title: 'Stock Value', format: formatEur },
  { metric: 'excessStockValue', title: 'Excess Stock value', format: formatEur },
  { metric: 'inventoryAvailabilityPct', title: 'Inventory Availability', format: pct, percent: true },
  { metric: 'belowMinimumCount', title: 'Items below minimum', format: formatInteger },
  { metric: 'medianAutonomyDays', title: 'Median Stock Autonomy', format: days },
  { metric: 'stockTurnover', title: 'Stock Turnover (per year)', format: (v) => (v === null ? '–' : `${formatDecimal(v)}x`) },
  { metric: 'replenishmentTimeDays', title: 'Replenishment Time', format: days },
];

interface Row {
  offset: number;
  currentDate: string;
  previousDate?: string;
  current: number | null;
  previous: number | null;
}

/** Joins the two periods by day offset, so the previous period is drawn over the current one. */
function rowsOf(data: TrendsData, metric: Metric): Row[] {
  const prevByOffset = new Map(data.previous.map((p) => [p.offset, p]));
  return data.current.map((p) => ({
    offset: p.offset,
    currentDate: p.date,
    previousDate: prevByOffset.get(p.offset)?.date,
    current: p[metric],
    previous: prevByOffset.get(p.offset)?.[metric] ?? null,
  }));
}

function IndicatorChart({ spec, data }: { spec: (typeof METRICS)[number]; data: TrendsData }) {
  const rows = rowsOf(data, spec.metric);
  const hasPrevious = data.previous.length > 0;
  return (
    <section aria-label={`${spec.title} trend`} className="rounded-lg border bg-background">
      <h3 className="border-b px-3 py-2 text-sm font-medium">{spec.title}</h3>
      <div className="h-56 p-3">
        {rows.length === 0 ? (
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
                domain={spec.percent ? [0, 100] : ['auto', 'auto']}
                allowDecimals={spec.metric !== 'belowMinimumCount'}
              />
              <Tooltip
                formatter={(value, name) => [spec.format(value as number | null), name]}
                labelFormatter={(o) => {
                  const row = rows[Number(o)];
                  return row ? `${row.currentDate}${row.previousDate ? ` (previous: ${row.previousDate})` : ''}` : '';
                }}
              />
              <Legend />
              {hasPrevious && (
                <Line name="Previous period" dataKey="previous" stroke="#94a3b8" strokeWidth={1.5} strokeDasharray="5 4" dot={false} connectNulls isAnimationActive={false} />
              )}
              <Line name="Period" dataKey="current" stroke="#0d9488" strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </section>
  );
}

/** Historical trend of every indicator over the filtered period, with the previous period overlaid. */
export function TrendCharts({ query }: { query: string }) {
  const { data, isPending, error } = useTrends(query);
  return (
    <section aria-label="Indicator trends" className="space-y-2">
      <h2 className="text-sm font-medium">Trends</h2>
      {isPending && <p className="text-sm text-muted-foreground">Loading…</p>}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error.message}
        </p>
      )}
      {data && (
        <div className="grid gap-4 lg:grid-cols-2">
          {METRICS.map((spec) => (
            <IndicatorChart key={spec.metric} spec={spec} data={data} />
          ))}
        </div>
      )}
    </section>
  );
}
