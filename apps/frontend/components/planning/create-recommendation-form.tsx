'use client';

import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { TYPE_LABELS, useCreateRecommendation, type RankingRow, type RecommendationType } from '@/lib/planning';

/** Manual Recommendation for the chosen Item. Quantity and justification are optional: the suggested ones are used. */
export function CreateRecommendationForm({ item, onClose }: { item: RankingRow; onClose: () => void }) {
  const create = useCreateRecommendation();
  const [type, setType] = useState<RecommendationType>(item.holdPurchasesSuggested && item.urgencyLevel === 'NORMAL' ? 'HOLD_PURCHASES' : 'REPLENISH');
  const [quantity, setQuantity] = useState('');
  const [justification, setJustification] = useState('');

  function submit(event: FormEvent) {
    event.preventDefault();
    create.mutate(
      {
        itemId: item.itemId,
        type,
        quantity: type === 'REPLENISH' && quantity !== '' ? Number(quantity) : undefined,
        justification: justification.trim() || undefined,
      },
      { onSuccess: onClose },
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-md border bg-background p-4">
      <h3 className="font-medium">New Recommendation for {item.name}</h3>
      <div className="space-y-1">
        <Label htmlFor="rec-type">Type</Label>
        <select
          id="rec-type"
          value={type}
          onChange={(e) => setType(e.target.value as RecommendationType)}
          className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
        >
          {(Object.keys(TYPE_LABELS) as RecommendationType[]).map((t) => (
            <option key={t} value={t}>
              {TYPE_LABELS[t]}
            </option>
          ))}
        </select>
      </div>
      {type === 'REPLENISH' && (
        <div className="space-y-1">
          <Label htmlFor="rec-quantity">Quantity (suggested: {item.suggestedQuantity})</Label>
          <Input id="rec-quantity" type="number" min={0} value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder={String(item.suggestedQuantity)} />
        </div>
      )}
      <div className="space-y-1">
        <Label htmlFor="rec-justification">Justification (generated from the indicators when empty)</Label>
        <textarea
          id="rec-justification"
          value={justification}
          onChange={(e) => setJustification(e.target.value)}
          rows={3}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
      </div>
      {create.error && <p role="alert" className="text-sm text-destructive">{create.error.message}</p>}
      <div className="flex gap-2">
        <Button type="submit" disabled={create.isPending}>Create Draft</Button>
        <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
      </div>
    </form>
  );
}
