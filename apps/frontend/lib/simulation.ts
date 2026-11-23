'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';

export interface SimulationStatus {
  status: 'STOPPED' | 'RUNNING' | 'PAUSED' | 'FINISHED';
  running: boolean;
  startDate: string | null;
  currentDate: string | null;
  secondsPerDay: number | null;
  datasetEnd: string | null;
}

export const SIMULATION_KEY = ['simulation'] as const;

/** Polled every few seconds so every User sees the Simulation live. */
export function useSimulationStatus() {
  return useQuery({
    queryKey: SIMULATION_KEY,
    queryFn: () => api<SimulationStatus>('/simulation'),
    refetchInterval: 3_000,
  });
}

export function useSimulationAction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      action,
      body,
    }: {
      action: 'start' | 'pause' | 'resume' | 'stop';
      body?: { startDate: string; secondsPerDay: number };
    }) => api<SimulationStatus>(`/simulation/${action}`, { method: 'POST', body }),
    // Start and stop change the Reference Date, so everything cached is stale.
    onSuccess: () => queryClient.invalidateQueries(),
  });
}
