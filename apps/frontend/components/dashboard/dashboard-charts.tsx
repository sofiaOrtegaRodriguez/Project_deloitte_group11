'use client';

import { useSeries } from '@/lib/charts';
import { AbcDonut } from './abc-donut';
import { TimeSeriesChart } from './time-series-chart';

/** The ABC donut and the three time series, all for the active filters (`query` = filterQuery(filters)). */
export function DashboardCharts({ query }: { query: string }) {
  const { data, isPending, error } = useSeries(query);
  const shared = { data, isPending, error };
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="lg:col-span-2">
        <AbcDonut query={query} />
      </div>
      <TimeSeriesChart metric="stockValue" {...shared} />
      <TimeSeriesChart metric="consumptionValue" {...shared} />
      <div className="lg:col-span-2">
        <TimeSeriesChart metric="inventoryAvailabilityPct" {...shared} />
      </div>
    </div>
  );
}
