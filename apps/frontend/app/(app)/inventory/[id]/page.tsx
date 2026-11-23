'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Suspense } from 'react';
import { ArrowLeft } from 'lucide-react';
import { ItemAlerts } from '@/components/alerts/item-alerts';
import { ItemDetailView } from '@/components/item-detail/item-detail-view';
import { RecommendationList } from '@/components/planning/recommendation-list';
import { EMPTY_FILTERS, filterQuery, useFilters, withFilters } from '@/lib/filters';
import { useItemDetail } from '@/lib/item-detail';

export default function ItemDetailPage() {
  // useSearchParams (the filters live in the URL) needs a Suspense boundary.
  return (
    <Suspense fallback={<p className="text-muted-foreground">Loading…</p>}>
      <ItemDetail />
    </Suspense>
  );
}

function ItemDetail() {
  const params = useParams<{ id: string }>();
  const id = /^\d+$/.test(params.id) ? Number(params.id) : NaN;
  const { filters } = useFilters();
  // Only the period applies to a single Item; the other filters are kept in the URL for the way back.
  const periodQuery = filterQuery({ ...EMPTY_FILTERS, from: filters.from, to: filters.to });
  const { data, isPending, error } = useItemDetail(id, periodQuery);

  return (
    <div className="space-y-4">
      <Link
        href={withFilters('/inventory', filters)}
        className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
      >
        <ArrowLeft className="size-4" aria-hidden /> Back to Inventory
      </Link>
      {Number.isNaN(id) && <p role="alert" className="text-destructive">Item not found.</p>}
      {isPending && !Number.isNaN(id) && <p className="text-muted-foreground">Loading…</p>}
      {error && <p role="alert" className="text-destructive">{error.message}</p>}
      {data && <ItemDetailView detail={data} />}
      {data && (
        <>
          <ItemAlerts itemId={id} />
          <section aria-label="Item Recommendations" className="space-y-2">
            <h2 className="font-semibold">Recommendations</h2>
            <RecommendationList itemId={id} />
          </section>
        </>
      )}
    </div>
  );
}
