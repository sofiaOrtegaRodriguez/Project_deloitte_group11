'use client';

import { useState } from 'react';
import { STATUS_LABELS, useItemAlerts, type AlertDetail } from '@/lib/alerts';
import { AlertBody, LevelBadge } from './alert-item';

function ItemAlert({ alert, defaultOpen }: { alert: AlertDetail; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <li className="px-3 py-2">
      <button
        type="button"
        className="flex w-full cursor-pointer items-center gap-2 text-left"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <LevelBadge level={alert.level} />
        <span className="flex-1 text-sm">Opened {new Date(alert.createdAt).toLocaleDateString('en-GB')}</span>
        <span className="text-xs text-muted-foreground">{STATUS_LABELS[alert.status]}</span>
      </button>
      {open && (
        <div className="mt-2">
          <AlertBody alert={alert} />
        </div>
      )}
    </li>
  );
}

/** The Alerts of one Item with history and comments. Meant for the Item detail page (ticket 08). */
export function ItemAlerts({ itemId }: { itemId: number }) {
  const { data, isPending, error } = useItemAlerts(itemId);
  return (
    <section className="rounded-md border bg-background" aria-label="Item Alerts">
      <h2 className="border-b px-3 py-2 font-semibold">Alerts</h2>
      {isPending && <p className="p-3 text-muted-foreground">Loading…</p>}
      {error && <p role="alert" className="p-3 text-destructive">{error.message}</p>}
      {data?.length === 0 && <p className="p-3 text-muted-foreground">This Item has no Alerts.</p>}
      {data && data.length > 0 && (
        <ul className="divide-y">
          {data.map((alert, i) => (
            <ItemAlert key={alert.id} alert={alert} defaultOpen={i === 0 && alert.status !== 'CLEARED'} />
          ))}
        </ul>
      )}
    </section>
  );
}
