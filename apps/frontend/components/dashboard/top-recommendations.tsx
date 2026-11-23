'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useCurrentUser } from '@/lib/auth';
import {
  formatMoney,
  TYPE_LABELS,
  useApproveRecommendation,
  useRejectRecommendation,
  useTopPendingRecommendations,
  type Recommendation,
} from '@/lib/planning';

function Row({ rec, isDirector }: { rec: Recommendation; isDirector: boolean }) {
  const approve = useApproveRecommendation();
  const reject = useRejectRecommendation();
  const [rejecting, setRejecting] = useState(false);
  const [comment, setComment] = useState('');
  const error = approve.error ?? reject.error;

  return (
    <li data-testid="top-recommendation" className="space-y-1 px-3 py-2 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <span className="font-medium">
            #{rec.id} {TYPE_LABELS[rec.type]} · {rec.itemName}
          </span>
          <span className="ml-2 text-xs text-muted-foreground">
            Priority Score {rec.priorityScore === null ? '-' : rec.priorityScore.toFixed(1)}
            {rec.type === 'REPLENISH' ? ` · ${rec.quantity} units · ${formatMoney(rec.estimatedCost)}` : ''}
          </span>
        </div>
        {isDirector && !rejecting && (
          <div className="flex gap-2">
            <Button size="sm" disabled={approve.isPending} onClick={() => approve.mutate({ id: rec.id })}>Approve</Button>
            <Button size="sm" variant="outline" onClick={() => setRejecting(true)}>Reject</Button>
          </div>
        )}
      </div>
      {rejecting && (
        <div className="flex flex-wrap items-center gap-2">
          <Input
            aria-label="Rejection comment"
            placeholder="Comment (required)"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            className="max-w-sm"
          />
          <Button
            size="sm"
            disabled={reject.isPending || comment.trim() === ''}
            onClick={() => reject.mutate({ id: rec.id, comment: comment.trim() }, { onSuccess: () => setRejecting(false) })}
          >
            Confirm Reject
          </Button>
          <Button size="sm" variant="outline" onClick={() => setRejecting(false)}>Cancel</Button>
        </div>
      )}
      {error && <p role="alert" className="text-xs text-destructive">{error.message}</p>}
    </li>
  );
}

/** The 5 highest-priority Recommendations pending approval. The Director can decide from here; the Team can only read. */
export function TopRecommendations() {
  const { data: user } = useCurrentUser();
  const { data, isPending, error } = useTopPendingRecommendations(5);
  const isDirector = user?.role === 'DIRECTOR';

  return (
    <section aria-label="Recommendations pending approval" className="rounded-lg border bg-background">
      <h2 className="border-b px-3 py-2 text-sm font-medium">Recommendations pending approval</h2>
      {isPending && <p className="p-3 text-sm text-muted-foreground">Loading…</p>}
      {error && <p role="alert" className="p-3 text-sm text-destructive">{error.message}</p>}
      {data?.length === 0 && <p className="p-3 text-sm text-muted-foreground">Nothing is waiting for approval.</p>}
      {data && data.length > 0 && (
        <ul className="divide-y">
          {data.map((rec) => (
            <Row key={rec.id} rec={rec} isDirector={isDirector} />
          ))}
        </ul>
      )}
      <p className="border-t px-3 py-1.5 text-xs text-muted-foreground">
        Approved Recommendations are ready to process outside Hosstock. Hosstock never places a purchase.
      </p>
    </section>
  );
}
