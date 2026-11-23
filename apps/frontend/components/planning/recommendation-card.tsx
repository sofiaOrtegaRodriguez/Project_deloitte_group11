'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  EVENT_LABELS,
  formatMoney,
  STATUS_LABELS,
  TYPE_LABELS,
  useDiscardRecommendation,
  useEditRecommendation,
  type Recommendation,
} from '@/lib/planning';

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

/** One Recommendation with its figures, justification and history. Drafts can be edited and Discarded. */
export function RecommendationCard({ rec, showItem = true }: { rec: Recommendation; showItem?: boolean }) {
  const [mode, setMode] = useState<'view' | 'edit' | 'discard'>('view');
  const isDraft = rec.status === 'DRAFT';

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
      {mode === 'edit' ? (
        <EditForm rec={rec} onDone={() => setMode('view')} />
      ) : (
        <p>{rec.justification}</p>
      )}
      {rec.discardReason && <p className="text-xs">Discard reason: {rec.discardReason}</p>}
      {mode === 'discard' && <DiscardForm rec={rec} onDone={() => setMode('view')} />}
      {isDraft && mode === 'view' && (
        <div className="flex gap-2">
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
            </li>
          ))}
        </ul>
      </details>
    </li>
  );
}
