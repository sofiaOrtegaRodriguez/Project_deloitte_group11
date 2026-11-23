'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { SIMULATION_KEY, useSimulationStatus } from '@/lib/simulation';

/** Shown to every User at the top of the app while a Simulation is in progress. */
export function SimulationBanner() {
  const { data } = useSimulationStatus();
  const queryClient = useQueryClient();
  const date = data?.currentDate ?? null;

  // Each step recalculates, so everything shown on screen is stale when the simulated date moves.
  useEffect(() => {
    if (date) {
      void queryClient.invalidateQueries({ predicate: (query) => query.queryKey[0] !== SIMULATION_KEY[0] });
    }
  }, [date, queryClient]);

  if (!data || data.status === 'STOPPED') return null;
  const suffix = data.status === 'PAUSED' ? ' (paused)' : data.status === 'FINISHED' ? ' (end of data)' : '';
  return (
    <div role="status" className="bg-amber-500 px-5 py-1.5 text-center text-sm font-semibold text-black">
      SIMULATION — {data.currentDate}
      {suffix}
    </div>
  );
}
