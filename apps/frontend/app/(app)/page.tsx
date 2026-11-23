'use client';

import { KpiCards } from '@/components/dashboard/kpi-cards';
import { TopItems } from '@/components/dashboard/top-items';
import { UrgencyCounts } from '@/components/dashboard/urgency-counts';
import { useDashboard } from '@/lib/dashboard';

export default function DashboardPage() {
  const { data, isPending, error } = useDashboard();

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <h1 className="text-xl font-semibold">Dashboard</h1>
        {data?.period && (
          <p className="text-xs text-muted-foreground">
            {data.period.start} to {data.period.end}
            {data.previousPeriod && ` · compared with ${data.previousPeriod.start} to ${data.previousPeriod.end}`}
          </p>
        )}
      </div>
      {isPending && <p className="text-muted-foreground">Loading…</p>}
      {error && (
        <p role="alert" className="text-destructive">
          {error.message}
        </p>
      )}
      {data &&
        (data.current === null ? (
          <p className="text-muted-foreground">No data yet. Run the ETL to load Snapshots.</p>
        ) : (
          <>
            <KpiCards data={data} />
            <UrgencyCounts counts={data.urgencyCounts} />
            <TopItems items={data.topItems} />
            {/* Space for later widgets: charts (ticket 07), Alerts (11), Recommendations. Add each as its own component. */}
          </>
        ))}
    </div>
  );
}
