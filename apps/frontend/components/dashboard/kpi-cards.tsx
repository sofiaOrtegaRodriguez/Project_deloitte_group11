import { ArrowDown, ArrowUp, Info, Minus } from 'lucide-react';
import type { DashboardData, KpiDelta, KpiKey } from '@/lib/dashboard';

const eur = new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const num1 = new Intl.NumberFormat('pt-PT', { maximumFractionDigits: 1 });
const int = new Intl.NumberFormat('pt-PT', { maximumFractionDigits: 0 });

interface KpiDef {
  key: KpiKey;
  label: string;
  format: (v: number) => string;
  /** Formula and aggregation, shown in the tooltip. */
  help: string;
}

const KPIS: KpiDef[] = [
  {
    key: 'stockValue',
    label: 'Stock Value',
    format: (v) => eur.format(v),
    help: 'Σ (current stock × unit cost) over all Items, as of the end of the period. Aggregation: sum.',
  },
  {
    key: 'excessStockValue',
    label: 'Excess Stock',
    format: (v) => eur.format(v),
    help: 'Σ (max(0, current stock − max capacity) × unit cost). Aggregation: sum.',
  },
  {
    key: 'inventoryAvailabilityPct',
    label: 'Inventory Availability',
    format: (v) => `${num1.format(v)} %`,
    help: 'Items with stock at or above their minimum ÷ Items with stock data × 100. Aggregation: share of Items.',
  },
  {
    key: 'belowMinimumCount',
    label: 'Items below minimum',
    format: (v) => int.format(v),
    help: 'Number of Items whose current stock is below their minimum required. Aggregation: count.',
  },
  {
    key: 'medianAutonomyDays',
    label: 'Stock Autonomy',
    format: (v) => `${num1.format(v)} d`,
    help: 'Current stock ÷ average daily usage, in days. Aggregation: median across the Items that consume stock.',
  },
  {
    key: 'weightedTurnover',
    label: 'Stock Turnover',
    format: (v) => `${num1.format(v)} ×/yr`,
    help: 'Annual consumption value ÷ mean Stock Value. Aggregation: value-weighted (Σ consumption ÷ Σ mean stock value across Items).',
  },
  {
    key: 'meanReplenishmentTimeDays',
    label: 'Replenishment Time',
    format: (v) => `${num1.format(v)} d`,
    help: 'Days between ordering and receiving, averaged over the period per Item. Aggregation: mean across Items.',
  },
];

function DeltaBadge({ delta, format }: { delta: KpiDelta | undefined; format: (v: number) => string }) {
  if (!delta || delta.absolute === null) {
    return <span className="text-xs text-muted-foreground">No previous period</span>;
  }
  const Icon = delta.absolute > 0 ? ArrowUp : delta.absolute < 0 ? ArrowDown : Minus;
  const sign = delta.absolute > 0 ? '+' : '';
  const pct = delta.pct === null ? '' : ` (${sign}${num1.format(delta.pct)} %)`;
  // Neutral colour on purpose: red, amber and green are reserved for Urgency Levels.
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      <Icon className="size-3" aria-hidden />
      {sign}
      {format(delta.absolute)}
      {pct} vs previous period
    </span>
  );
}

function Tooltip({ text }: { text: string }) {
  return (
    <span className="group relative inline-flex">
      <button type="button" aria-label={`About: ${text}`} className="text-muted-foreground hover:text-foreground">
        <Info className="size-3.5" aria-hidden />
      </button>
      <span
        role="tooltip"
        className="pointer-events-none absolute right-0 top-5 z-10 hidden w-56 rounded-md border bg-background p-2 text-xs font-normal text-foreground shadow-md group-focus-within:block group-hover:block"
      >
        {text}
      </span>
    </span>
  );
}

export function KpiCards({ data }: { data: DashboardData }) {
  return (
    <section aria-label="Key indicators" className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {KPIS.map((kpi) => {
        const value = data.current?.[kpi.key];
        return (
          <div key={kpi.key} data-testid={`kpi-${kpi.key}`} className="rounded-lg border bg-background p-3">
            <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>{kpi.label}</span>
              <Tooltip text={kpi.help} />
            </div>
            <div className="mt-1 text-xl font-semibold tabular-nums">
              {value === null || value === undefined ? '–' : kpi.format(value)}
            </div>
            <DeltaBadge delta={data.deltas?.[kpi.key]} format={kpi.format} />
          </div>
        );
      })}
    </section>
  );
}
