'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useCurrentUser } from '@/lib/auth';
import {
  EVENT_LABELS,
  formatMoney,
  STATUS_LABELS,
  TYPE_LABELS,
  useDiscardRecommendation,
  useApproveRecommendation,
  useEditRecommendation,
  useRejectRecommendation,
  useSubmitRecommendation,
  type Recommendation,
} from '@/lib/planning';

import { StaleWarning } from './stale-warning';

function EditForm({ rec, onDone }: { rec: Recommendation; onDone: () => void }) {
  const edit = useEditRecommendation();
  const [quantity, setQuantity] = useState(String(rec.quantity));
  const [justification, setJustification] = useState(rec.justification);

  return (
    <div className="space-y-2">
      {rec.type === 'REPLENISH' && (
        <label className="block text-sm">
          Quantity
          <Input type="number" min={0} value={quantity} onChange={(e) => setQuantity(e.target.value)} />
        </label>
      )}
      <label className="block text-sm">
        Justification
        <textarea
          value={justification}
          onChange={(e) => setJustification(e.target.value)}
          rows={4}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
      </label>
      {edit.error && <p role="alert" className="text-sm text-destructive">{edit.error.message}</p>}
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={edit.isPending || justification.trim() === ''}
          onClick={() =>
            edit.mutate(
              {
                id: rec.id,
                quantity: rec.type === 'REPLENISH' && quantity !== '' && Number(quantity) !== rec.quantity ? Number(quantity) : undefined,
                justification: justification !== rec.justification ? justification : undefined,
              },
              { onSuccess: onDone },
            )
          }
        >
          Save
        </Button>
        <Button size="sm" variant="outline" onClick={onDone}>Cancel</Button>
      </div>
    </div>
  );
}

function DiscardForm({ rec, onDone }: { rec: Recommendation; onDone: () => void }) {
  const discard = useDiscardRecommendation();
  const [reason, setReason] = useState('');
  return (
    <div className="space-y-2">
      <label className="block text-sm">
        Reason (optional)
        <Input value={reason} onChange={(e) => setReason(e.target.value)} />
      </label>
      {discard.error && <p role="alert" className="text-sm text-destructive">{discard.error.message}</p>}
      <div className="flex gap-2">
        <Button size="sm" disabled={discard.isPending} onClick={() => discard.mutate({ id: rec.id, reason: reason.trim() || undefined }, { onSuccess: onDone })}>
          Confirm Discard
        </Button>
        <Button size="sm" variant="outline" onClick={onDone}>Cancel</Button>
      </div>
    </div>
  );
}

/** The Indicator Snapshot frozen at Submit: what the Director is deciding on. */
export function SnapshotView({ rec }: { rec: Recommendation }) {
  const snap = rec.indicatorSnapshot;
  if (!snap) return null;
  const ind = snap.indicators;
  const fmt = (n: number | null | undefined, digits = 1) => (n === null || n === undefined ? '-' : n.toFixed(digits));
  return (
    <div className="rounded border bg-muted/40 p-2 text-xs" data-testid="indicator-snapshot">
      <div className="font-medium">Indicator Snapshot at submission ({new Date(snap.takenAt).toLocaleString()})</div>
      <div className="mt-1 flex flex-wrap gap-x-4">
        {ind ? (
          <>
            <span>Urgency {ind.urgencyLevel ?? '-'}</span>
            <span>Priority Score {fmt(ind.priorityScore)}</span>
            <span>ABC Class {ind.abcClass ?? '-'}</span>
            <span>Current stock {fmt(ind.state?.currentStock, 0)}</span>
            <span>Autonomy {ind.stockAutonomyDays === null ? '-' : `${fmt(ind.stockAutonomyDays)} d`}</span>
            <span>Replenishment Time {fmt(ind.replenishmentTimeDays)} d</span>
          </>
        ) : (
          <span>No indicators were available for this Item.</span>
        )}
        <span>Quantity {snap.quantity}</span>
        <span>Estimated cost {formatMoney(snap.estimatedCost)}</span>
      </div>
    </div>
  );
}

function DecisionForm({ rec, onDone }: { rec: Recommendation; onDone: () => void }) {
  const reject = useRejectRecommendation();
  const [comment, setComment] = useState('');
  return (
    <div className="space-y-2">
      <label className="block text-sm">
        Comment (required)
        <Input value={comment} onChange={(e) => setComment(e.target.value)} />
      </label>
      {reject.error && <p role="alert" className="text-sm text-destructive">{reject.error.message}</p>}
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={reject.isPending || comment.trim() === ''}
          onClick={() => reject.mutate({ id: rec.id, comment: comment.trim() }, { onSuccess: onDone })}
        >
          Confirm Reject
        </Button>
        <Button size="sm" variant="outline" onClick={onDone}>Cancel</Button>
      </div>
    </div>
  );
}

/** One Recommendation with its figures, justification and history. Drafts can be edited and Discarded. */
export function RecommendationCard({ rec, showItem = true }: { rec: Recommendation; showItem?: boolean }) {
  const [mode, setMode] = useState<'view' | 'edit' | 'discard' | 'reject'>('view');
  const isDraft = rec.status === 'DRAFT';
  const { data: user } = useCurrentUser();
  const submit = useSubmitRecommendation();
  const approve = useApproveRecommendation();
  const actionError = submit.error ?? approve.error;

  return (
    <li className="space-y-2 rounded-md border bg-background p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="font-medium">
          #{rec.id} {TYPE_LABELS[rec.type]}
          {showItem && <> · {rec.itemName}</>}
        </div>
        <span className="rounded bg-muted px-1.5 py-0.5 text-xs font-medium">{STATUS_LABELS[rec.status]}</span>
      </div>
      <div className="flex flex-wrap gap-x-4 text-xs text-muted-foreground">
        {rec.type === 'REPLENISH' ? (
          <>
            <span>Quantity {rec.quantity}</span>
            <span>Estimated cost {formatMoney(rec.estimatedCost)}</span>
          </>
        ) : (
          <span>Frees {formatMoney(rec.figures.freedCapital)} of tied-up capital</span>
        )}
        <span>Priority Score {rec.priorityScore === null ? '-' : rec.priorityScore.toFixed(1)}</span>
      </div>
      {isDraft && <StaleWarning rec={rec} />}
      {mode === 'edit' ? (
        <EditForm rec={rec} onDone={() => setMode('view')} />
      ) : (
        <p>{rec.justification}</p>
      )}
      {rec.discardReason && <p className="text-xs">Discard reason: {rec.discardReason}</p>}
      {mode === 'discard' && <DiscardForm rec={rec} onDone={() => setMode('view')} />}
      {rec.indicatorSnapshot && <SnapshotView rec={rec} />}
      {rec.status === 'APPROVED' && <p className="text-xs">Approved: ready to process outside Hosstock.</p>}
      {rec.status === 'REJECTED' && rec.decisionComment && <p className="text-xs">Rejection comment: {rec.decisionComment}</p>}
      {actionError && <p role="alert" className="text-sm text-destructive">{actionError.message}</p>}
      {rec.status === 'PENDING_APPROVAL' && user?.role === 'DIRECTOR' && mode === 'view' && (
        <div className="flex gap-2">
          <Button size="sm" disabled={approve.isPending} onClick={() => approve.mutate({ id: rec.id })}>Approve</Button>
          <Button size="sm" variant="outline" onClick={() => setMode('reject')}>Reject</Button>
        </div>
      )}
      {mode === 'reject' && <DecisionForm rec={rec} onDone={() => setMode('view')} />}
      {isDraft && mode === 'view' && (
        <div className="flex gap-2">
          <Button size="sm" disabled={submit.isPending} onClick={() => submit.mutate({ id: rec.id })}>Submit</Button>
          <Button size="sm" variant="outline" onClick={() => setMode('edit')}>Edit</Button>
          <Button size="sm" variant="outline" onClick={() => setMode('discard')}>Discard</Button>
        </div>
      )}
      <details className="text-xs text-muted-foreground">
        <summary className="cursor-pointer">History ({rec.history.length})</summary>
        <ul className="mt-1 space-y-0.5">
          {rec.history.map((event) => (
            <li key={event.id}>
              {EVENT_LABELS[event.type] ?? event.type} by {event.user ? event.user.name : 'system'} on{' '}
              {new Date(event.at).toLocaleString()}
              {event.type === 'REJECTED' && event.details?.comment ? ` (${event.details.comment})` : ''}
            </li>
          ))}
        </ul>
      </details>
    </li>
  );
}
