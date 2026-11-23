'use client';

import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatDecimal } from '@/lib/format';
import type { SeriesPoint } from '@/lib/item-detail';

// Neutral/blue palette: red, amber and green are reserved for Urgency.
const STOCK = '#0d9488';
const MIN = '#2563eb';
const MAX = '#7c3aed';
const USAGE = '#0369a1';

const tick = { fontSize: 11 };
const format = (v: unknown) => (typeof v === 'number' ? formatDecimal(v) : String(v ?? '–'));

export function StockHistoryChart({ series }: { series: SeriesPoint[] }) {
  if (!series.some((p) => p.currentStock !== null)) {
    return <p className="text-sm text-muted-foreground">No stock data in this period.</p>;
  }
  return (
    <div className="h-72 w-full" role="img" aria-label="Stock history against the minimum and maximum">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={series} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="date" tick={tick} minTickGap={24} />
          <YAxis tick={tick} width={48} tickFormatter={format} />
          <Tooltip formatter={format} />
          <Legend />
          <Line type="stepAfter" dataKey="currentStock" name="Stock" stroke={STOCK} strokeWidth={2} dot={false} connectNulls={false} isAnimationActive={false} />
          <Line type="stepAfter" dataKey="minRequired" name="Minimum" stroke={MIN} strokeDasharray="6 4" dot={false} isAnimationActive={false} />
          <Line type="stepAfter" dataKey="maxCapacity" name="Maximum" stroke={MAX} strokeDasharray="6 4" dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function UsageHistoryChart({ series }: { series: SeriesPoint[] }) {
  if (!series.some((p) => p.avgUsagePerDay !== null)) {
    return <p className="text-sm text-muted-foreground">No usage data in this period.</p>;
  }
  return (
    <div className="h-56 w-full" role="img" aria-label="Average usage per day">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={series} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="date" tick={tick} minTickGap={24} />
          <YAxis tick={tick} width={40} tickFormatter={format} />
          <Tooltip formatter={format} />
          <Line type="stepAfter" dataKey="avgUsagePerDay" name="Usage per day" stroke={USAGE} strokeWidth={2} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
