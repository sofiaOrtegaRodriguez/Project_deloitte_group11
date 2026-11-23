'use client';

import { InventoryTable } from '@/components/inventory-table';
import { useItems } from '@/lib/items';

export default function InventoryPage() {
  const { data, isPending, error } = useItems();
  return (
    <div className="space-y-3">
      <div>
        <h1 className="text-xl font-semibold">Inventory</h1>
        <p className="text-sm text-muted-foreground">
          Every Item with its stock, thresholds and indicators{data?.referenceDate ? `, as of ${data.referenceDate}` : ''}.
        </p>
      </div>
      {isPending && <p className="text-muted-foreground">Loading…</p>}
      {error && <p role="alert" className="text-destructive">{error.message}</p>}
      {data && <InventoryTable items={data.items} />}
    </div>
  );
}
