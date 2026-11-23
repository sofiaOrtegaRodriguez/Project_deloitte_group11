'use client';

import { useRecommendations } from '@/lib/planning';
import { RecommendationCard } from './recommendation-card';

/** Recommendations of every Item, or of one Item when `itemId` is given (Item detail page). */
export function RecommendationList({ itemId }: { itemId?: number }) {
  const { data, isPending, error } = useRecommendations(itemId);
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-semibold">Recommendations</h2>
      {isPending && <p className="text-muted-foreground">Loading…</p>}
      {error && <p role="alert" className="text-destructive">{error.message}</p>}
      {data?.length === 0 && <p className="text-muted-foreground">No Recommendations yet.</p>}
      {data && data.length > 0 && (
        <ul className="space-y-2">
          {data.map((rec) => (
            <RecommendationCard key={rec.id} rec={rec} showItem={itemId === undefined} />
          ))}
        </ul>
      )}
    </section>
  );
}
