'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { KPIS } from '@/components/dashboard/kpi-cards';
import { useMonitor, type MonitorData } from '@/lib/monitor';

const time = new Intl.DateTimeFormat('pt-PT', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
const HIGHLIGHT_MS = 5_000;

function SimulationBadge({ simulation }: { simulation: MonitorData['simulation'] }) {
  const simulated = (simulation.status === 'RUNNING' || simulation.status === 'PAUSED') && simulation.currentDate;
  return simulated ? (
    <span data-testid="monitor-mode" className="rounded-full bg-teal-700 px-2.5 py-0.5 text-xs font-semibold text-white">
      SIMULATION — {simulation.currentDate}
      {simulation.status === 'PAUSED' ? ' (paused)' : ''}
    </span>
  ) : (
    <span data-testid="monitor-mode" className="rounded-full bg-slate-200 px-2.5 py-0.5 text-xs font-semibold text-slate-700">
      Real data
    </span>
  );
}

/** Ids of events not seen in the previous response, kept for a few seconds so the feed can highlight them. */
function useFreshEvents(data: MonitorData | undefined): Set<string> {
  const seen = useRef<Set<string> | null>(null);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!data) return;
    const ids = data.events.map((e) => e.id);
    const previous = seen.current;
    seen.current = new Set(ids);
    // The first response is the baseline: nothing is "new" yet.
    if (!previous) return;
    const added = ids.filter((id) => !previous.has(id));
    if (added.length === 0) return;
    setFresh(new Set(added));
    const timer = setTimeout(() => setFresh(new Set()), HIGHLIGHT_MS);
    return () => clearTimeout(timer);
  }, [data]);
  return fresh;
}

export function LiveMonitor() {
  const { data, isError, dataUpdatedAt } = useMonitor();
  const fresh = useFreshEvents(data);

  return (
    <section aria-label="Live monitor" data-testid="live-monitor" className="space-y-3 rounded-lg border border-teal-700/30 bg-slate-50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-slate-800">Live monitor</h2>
        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600">
          {data && <span>Reference Date: {data.referenceDate ?? '–'}</span>}
          {data && <SimulationBadge simulation={data.simulation} />}
          <span data-testid="monitor-updated">
            {dataUpdatedAt ? `Last updated ${time.format(dataUpdatedAt)}` : 'Loading…'}
            {data ? ` · every ${data.refreshSeconds} s` : ''}
          </span>
        </div>
      </div>
      {isError && <p className="text-sm text-slate-600">Could not refresh the monitor. Retrying at the next interval.</p>}

      {data && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {KPIS.map((kpi) => {
              const value = data.kpis?.[kpi.key];
              return (
                <div key={kpi.key} data-testid={`monitor-kpi-${kpi.key}`} className="rounded-md border bg-background p-3">
                  <div className="text-xs text-muted-foreground">{kpi.label}</div>
                  <div className="mt-1 text-lg font-semibold tabular-nums text-slate-900">
                    {value === null || value === undefined ? '–' : kpi.format(value)}
                  </div>
                </div>
              );
            })}
          </div>

          <div>
            <h3 className="mb-1 text-sm font-medium text-slate-700">Latest events</h3>
            {data.events.length === 0 ? (
              <p className="text-sm text-muted-foreground">No events yet.</p>
            ) : (
              <ul data-testid="monitor-events" className="max-h-72 divide-y overflow-y-auto rounded-md border bg-background text-sm">
                {data.events.map((e) => (
                  <li
                    key={e.id}
                    data-fresh={fresh.has(e.id) || undefined}
                    className={`flex items-baseline justify-between gap-3 px-3 py-1.5 transition-colors duration-1000 ${
                      fresh.has(e.id) ? 'bg-teal-100' : ''
                    }`}
                  >
                    <Link href={`/inventory/${e.itemId}`} className="hover:underline">
                      {e.message}
                    </Link>
                    <span className="shrink-0 text-xs text-muted-foreground">{time.format(new Date(e.createdAt))}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </section>
  );
}
