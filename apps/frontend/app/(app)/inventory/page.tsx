'use client';

import { Suspense } from 'react';
import { ExportButtons } from '@/components/export-buttons';
import { FilterBar } from '@/components/filter-bar';
import { InventoryTable } from '@/components/inventory-table';
import { useFilters } from '@/lib/filters';
import { useItems } from '@/lib/items';

export default function InventoryPage() {
  // useSearchParams (the filters live in the URL) needs a Suspense boundary.
  return (
    <Suspense fallback={<p className="text-muted-foreground">Loading…</p>}>
      <Inventory />
    </Suspense>
  );
}

function Inventory() {
  const { filters, query } = useFilters();
  const { data, isPending, error } = useItems(query);
  return (
    <div className="space-y-3">
      <div>
        <h1 className="text-xl font-semibold">Inventory</h1>
        <p className="text-sm text-muted-foreground">
          Every Item with its stock, thresholds and indicators{data?.referenceDate ? `, as of ${data.referenceDate}` : ''}.
        </p>
      </div>
      <FilterBar />
      <ExportButtons csv excel />
      {isPending && <p className="text-muted-foreground">Loading…</p>}
      {error && <p role="alert" className="text-destructive">{error.message}</p>}
      {data && <InventoryTable items={data.items} filters={filters} />}
    </div>
  );
}
