'use client';

import { Suspense } from 'react';
import { AlertsWidget } from '@/components/alerts/alerts-widget';
import { TopRecommendations } from '@/components/dashboard/top-recommendations';
import { KpiCards } from '@/components/dashboard/kpi-cards';
import { TopItems } from '@/components/dashboard/top-items';
import { UrgencyCounts } from '@/components/dashboard/urgency-counts';
import { FilterBar } from '@/components/filter-bar';
import { useDashboard } from '@/lib/dashboard';
import { useFilters } from '@/lib/filters';

export default function DashboardPage() {
  // useSearchParams (the filters live in the URL) needs a Suspense boundary.
  return (
    <Suspense fallback={<p className="text-muted-foreground">Loading…</p>}>
      <Dashboard />
    </Suspense>
  );
}

function Dashboard() {
  const { filters, query } = useFilters();
  const { data, isPending, error } = useDashboard(query);

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
      <FilterBar />
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
            <TopItems items={data.topItems} filters={filters} />
            <TopRecommendations />
            {/* Space for later widgets: charts (ticket 07). Add each as its own component. */}
          </>
        ))}
      <AlertsWidget />
    </div>
  );
}
