'use client';

import { useAlerts } from '@/lib/alerts';
import { AlertItem } from './alert-item';

/** Open Alerts ordered by Urgency Level (the API order), shared by the bell panel and the Dashboard widget. */
export function AlertsList({ limit }: { limit?: number }) {
  const { data, isPending, error } = useAlerts();
  if (isPending) return <p className="p-3 text-muted-foreground">Loading…</p>;
  if (error) return <p role="alert" className="p-3 text-destructive">{error.message}</p>;
  if (data.length === 0) return <p className="p-3 text-muted-foreground">No open Alerts.</p>;
  const shown = limit ? data.slice(0, limit) : data;
  return (
    <>
      <ul className="divide-y">
        {shown.map((alert) => (
          <AlertItem key={alert.id} alert={alert} />
        ))}
      </ul>
      {shown.length < data.length && (
        <p className="border-t px-3 py-2 text-xs text-muted-foreground">
          {data.length - shown.length} more in the bell panel.
        </p>
      )}
    </>
  );
}
