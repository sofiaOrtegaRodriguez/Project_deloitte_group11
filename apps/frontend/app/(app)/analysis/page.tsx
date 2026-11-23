'use client';

import { Suspense } from 'react';
import { LiveMonitor } from '@/components/analysis/live-monitor';
import { CategorySummary } from '@/components/analysis/category-summary';
import { Comparison } from '@/components/analysis/comparison';
import { ConsumptionTrends } from '@/components/analysis/consumption-trends';
import { TrendCharts } from '@/components/analysis/trend-charts';
import { FilterBar } from '@/components/filter-bar';
import { useFilters } from '@/lib/filters';

export default function AnalysisPage() {
  // useSearchParams (the filters live in the URL) needs a Suspense boundary.
  return (
    <Suspense fallback={<p className="text-muted-foreground">Loading…</p>}>
      <Analysis />
    </Suspense>
  );
}

function Analysis() {
  const { filters, query } = useFilters();
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Analysis</h1>
      <FilterBar />
      <LiveMonitor />
      <TrendCharts query={query} />
      <Comparison query={query} />
      <ConsumptionTrends query={query} filters={filters} />
      <CategorySummary query={query} />
    </div>
  );
}
