'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from './api';
import type { KpiValues } from './dashboard';

export interface MonitorEvent {
  id: string;
  source: 'ALERT' | 'RECOMMENDATION';
  type: string;
  message: string;
  itemId: number;
  itemName: string;
  actor: string;
  createdAt: string;
  alertId: number | null;
  recommendationId: number | null;
}

export interface MonitorData {
  refreshSeconds: number;
  referenceDate: string | null;
  kpis: KpiValues | null;
  simulation: {
    status: 'STOPPED' | 'RUNNING' | 'PAUSED' | 'FINISHED';
    currentDate: string | null;
    speed: number | null;
    datasetEnd: string | null;
  };
  events: MonitorEvent[];
}

export const MONITOR_KEY = ['monitor'] as const;

/** Used until the first response tells us the configured interval. */
export const DEFAULT_REFRESH_SECONDS = 30;

/** The live monitor, polled every `refreshSeconds` (from the API; no WebSockets). */
export function useMonitor() {
  return useQuery({
    queryKey: MONITOR_KEY,
    queryFn: () => api<MonitorData>('/monitor?limit=30'),
    refetchInterval: (query) => (query.state.data?.refreshSeconds ?? DEFAULT_REFRESH_SECONDS) * 1000,
  });
}
