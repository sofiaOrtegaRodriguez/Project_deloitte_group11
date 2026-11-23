'use client';

import { formatDecimal, formatEur, formatInteger } from '@/lib/format';
import { FLAG_LABELS, type ItemDetail, type SnapshotRow } from '@/lib/item-detail';
import type { StockStatus, UrgencyLevel } from '@/lib/items';
import { cn } from '@/lib/utils';
import { StockHistoryChart, UsageHistoryChart } from './charts';

const STATUS_LABEL: Record<StockStatus, string> = {
  BELOW_MINIMUM: 'Below Minimum',
  REORDER_NEEDED: 'Reorder Needed',
  EXCESS: 'Excess',
  NORMAL: 'Normal',
};

// Red/amber/green are reserved for Urgency.
const URGENCY: Record<UrgencyLevel, { label: string; className: string }> = {
  CRITICAL: { label: 'Critical', className: 'bg-critical/10 text-critical ring-critical/30' },
  ATTENTION: { label: 'Attention', className: 'bg-attention/10 text-attention ring-attention/30' },
  NORMAL: { label: 'Normal', className: 'bg-normal/10 text-normal ring-normal/30' },
};

/** Violet badge: warns without using the Urgency colours. */
const NOTICE = 'bg-violet-100 text-violet-800 ring-violet-300';

function Card({ title, children, hint }: { title: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="rounded-lg border bg-background p-3">
      <p className="text-xs text-muted-foreground">{title}</p>
      <div className="mt-1 text-lg font-semibold">{children}</div>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function days(value: number | null | undefined): string {
  return value == null ? '–' : `${formatDecimal(value)} days`;
}

function flagsOf(s: SnapshotRow): string[] {
  return (Object.keys(FLAG_LABELS) as (keyof typeof FLAG_LABELS)[]).filter((k) => s[k]).map((k) => FLAG_LABELS[k]);
}

export function ItemDetailView({ detail }: { detail: ItemDetail }) {
  const { item, indicators, leadTime, thresholdOverride } = detail;
  const trend = detail.consumptionTrendPct;
  const urgency = indicators?.urgencyLevel ? URGENCY[indicators.urgencyLevel] : null;

  return (
    <div className="space-y-4">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold">{item.name}</h1>
        <p className="text-sm text-muted-foreground">
          Item {item.sourceItemId} · {item.category} · {item.vendorName}
          {detail.period ? ` · ${detail.period.start} to ${detail.period.end}` : ''}
        </p>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {urgency && (
            <span className={cn('rounded-full px-2 py-0.5 font-semibold ring-1', urgency.className)}>{urgency.label}</span>
          )}
          {indicators?.stockStatus && <span className="rounded-full bg-muted px-2 py-0.5 ring-1 ring-border">{STATUS_LABEL[indicators.stockStatus]}</span>}
          {indicators?.abcClass && <span className="rounded-full bg-muted px-2 py-0.5 ring-1 ring-border">ABC {indicators.abcClass}</span>}
          {thresholdOverride && (
            <span className={cn('rounded-full px-2 py-0.5 ring-1', NOTICE)}>Threshold Override in force</span>
          )}
        </div>
      </header>

      {!indicators?.hasState && (
        <p className="text-sm text-muted-foreground">This Item has no Snapshot on or before the end of the period.</p>
      )}

      {indicators?.hasState && indicators.state && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Card title="Current stock">{formatDecimal(indicators.state.currentStock)}</Card>
          <Card title="Stock Value">{formatEur(indicators.stockValue)}</Card>
          <Card title="Stock Autonomy">{days(indicators.stockAutonomyDays)}</Card>
          <Card title="Turnover (per year)">{formatDecimal(indicators.stockTurnover)}</Card>
        </div>
      )}

      <section aria-label="Stock history" className="rounded-lg border bg-background p-3">
        <h2 className="mb-2 font-semibold">Stock history</h2>
        <StockHistoryChart series={detail.series} />
      </section>

      <div className="grid gap-3 md:grid-cols-2">
        <section aria-label="Usage history" className="rounded-lg border bg-background p-3">
          <h2 className="mb-2 font-semibold">Usage history</h2>
          <UsageHistoryChart series={detail.series} />
        </section>
        <div className="grid grid-cols-1 content-start gap-3">
          <Card
            title="Consumption trend"
            hint="Change in mean daily usage between the first and second half of the period."
          >
            {trend == null ? '–' : `${trend > 0 ? '+' : ''}${formatDecimal(trend)} %`}
          </Card>
          <Card title="Estimated Demand (next 30 days)" hint="Mean usage of the last 3 Snapshots x 30 days.">
            {detail.estimatedDemand30d == null ? '–' : `${formatInteger(detail.estimatedDemand30d)} units`}
          </Card>
        </div>
      </div>

      <section aria-label="Lead time" className="rounded-lg border bg-background p-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-semibold">Lead time</h2>
          {leadTime.mismatch && (
            <span role="status" className={cn('rounded-full px-2 py-0.5 text-xs font-semibold ring-1', NOTICE)}>
              Lead time mismatch
            </span>
          )}
        </div>
        <dl className="mt-2 grid grid-cols-2 gap-3 text-sm md:grid-cols-3">
          <div>
            <dt className="text-xs text-muted-foreground">Contracted Lead Time ({item.vendorName})</dt>
            <dd className="font-semibold">{days(leadTime.contractedDays)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Observed Replenishment Time (period mean)</dt>
            <dd className="font-semibold">{days(leadTime.observedDays)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Difference (contracted - observed)</dt>
            <dd className="font-semibold">{leadTime.differenceDays == null ? '–' : days(leadTime.differenceDays)}</dd>
          </div>
        </dl>
      </section>

      <section aria-label="Snapshots" className="rounded-lg border bg-background">
        <h2 className="border-b px-3 py-2 font-semibold">Snapshots</h2>
        {detail.snapshots.length === 0 ? (
          <p className="p-3 text-sm text-muted-foreground">No Snapshots in this period.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted text-muted-foreground">
                <tr>
                  {['Date', 'Stock', 'Min', 'Max', 'Usage / day', 'Replenishment (days)', 'Data quality'].map((h, i) => (
                    <th key={h} scope="col" className={cn('px-2 py-1.5 font-medium', i > 0 && i < 6 ? 'text-right' : 'text-left')}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {detail.snapshots.map((s) => (
                  <tr key={s.id}>
                    <td className="px-2 py-1.5">{s.date}</td>
                    <td className="px-2 py-1.5 text-right">{formatDecimal(s.currentStock)}</td>
                    <td className="px-2 py-1.5 text-right">{formatDecimal(s.minRequired)}</td>
                    <td className="px-2 py-1.5 text-right">{formatDecimal(s.maxCapacity)}</td>
                    <td className="px-2 py-1.5 text-right">{formatDecimal(s.avgUsagePerDay)}</td>
                    <td className="px-2 py-1.5 text-right">{formatDecimal(s.replenishmentTimeDays)}</td>
                    <td className="px-2 py-1.5">
                      {s.dataQuality && (
                        <span
                          className={cn('rounded-full px-2 py-0.5 font-semibold ring-1', NOTICE)}
                          title={flagsOf(s).join(', ')}
                        >
                          Data quality
                          <span className="sr-only">: {flagsOf(s).join(', ')}</span>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
