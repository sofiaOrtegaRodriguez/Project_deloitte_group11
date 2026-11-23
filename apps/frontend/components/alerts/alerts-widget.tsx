'use client';

import { AlertsList } from './alerts-list';

/** Dashboard widget: open Alerts, Critical first. */
export function AlertsWidget() {
  return (
    <section className="rounded-md border bg-background" aria-label="Alerts">
      <h2 className="border-b px-3 py-2 font-semibold">Alerts</h2>
      <AlertsList limit={8} />
    </section>
  );
}
