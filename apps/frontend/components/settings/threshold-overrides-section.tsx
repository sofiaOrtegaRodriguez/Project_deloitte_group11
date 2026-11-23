'use client';

import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useCurrentUser } from '@/lib/auth';
import { useClearOverride, useItemChoices, useOverrides, useSetOverride } from '@/lib/settings';

const show = (value: number | null) => (value === null ? 'Snapshot value' : String(value));

function OverrideForm() {
  const { data: items } = useItemChoices();
  const set = useSetOverride();
  const [itemId, setItemId] = useState('');
  const [min, setMin] = useState('');
  const [max, setMax] = useState('');

  function submit(event: FormEvent) {
    event.preventDefault();
    if (itemId === '' || (min === '' && max === '')) return;
    // An empty box leaves that side unchanged; use Clear on the list to remove an override.
    set.mutate(
      {
        itemId: Number(itemId),
        ...(min !== '' && { minRequired: Number(min) }),
        ...(max !== '' && { maxCapacity: Number(max) }),
      },
      {
        onSuccess: () => {
          setMin('');
          setMax('');
        },
      },
    );
  }

  return (
    <form onSubmit={submit} className="grid max-w-xl grid-cols-[2fr_1fr_1fr_auto] items-end gap-3">
      <div className="space-y-1">
        <Label htmlFor="override-item">Item</Label>
        <select
          id="override-item"
          value={itemId}
          onChange={(e) => setItemId(e.target.value)}
          className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
        >
          <option value="">Choose an Item…</option>
          {items?.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1">
        <Label htmlFor="override-min">Minimum</Label>
        <Input id="override-min" type="number" min={0} step="any" value={min} onChange={(e) => setMin(e.target.value)} />
      </div>
      <div className="space-y-1">
        <Label htmlFor="override-max">Maximum</Label>
        <Input id="override-max" type="number" min={0} step="any" value={max} onChange={(e) => setMax(e.target.value)} />
      </div>
      <Button type="submit" disabled={set.isPending || itemId === '' || (min === '' && max === '')}>
        Set override
      </Button>
      {set.error && (
        <p role="alert" className="col-span-4 text-sm text-destructive">
          {set.error.message}
        </p>
      )}
    </form>
  );
}

/** Settings → Threshold Overrides. The Director edits; the Procurement Team only sees the list. */
export function ThresholdOverridesSection() {
  const { data: user } = useCurrentUser();
  const { data: overrides, isPending, error } = useOverrides();
  const clear = useClearOverride();
  const isDirector = user?.role === 'DIRECTOR';

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">Threshold Overrides</h2>
      <p className="text-sm text-muted-foreground">
        An override replaces the minimum and/or maximum of an Item, taking priority over the data.
        {!isDirector && ' Only the Director can change them.'}
      </p>
      {isDirector && <OverrideForm />}
      {isPending && <p className="text-muted-foreground">Loading…</p>}
      {error && <p role="alert" className="text-destructive">{error.message}</p>}
      {clear.error && <p role="alert" className="text-destructive">{clear.error.message}</p>}
      {overrides?.length === 0 && <p className="text-muted-foreground">No Threshold Overrides.</p>}
      {overrides && overrides.length > 0 && (
        <ul className="divide-y rounded-md border bg-background">
          {overrides.map((o) => (
            <li key={o.itemId} className="flex items-center justify-between gap-3 px-3 py-2">
              <div className="leading-tight">
                <div className="font-medium">{o.name}</div>
                <div className="text-xs text-muted-foreground">
                  Minimum: {show(o.minRequired)} · Maximum: {show(o.maxCapacity)}
                </div>
              </div>
              {isDirector && (
                <Button size="sm" variant="outline" disabled={clear.isPending} onClick={() => clear.mutate(o.itemId)}>
                  Clear
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
