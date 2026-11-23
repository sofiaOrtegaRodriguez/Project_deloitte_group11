'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';

export interface Configuration {
  referenceDate: string | null;
  effectiveReferenceDate: string | null;
  datasetRange: { start: string; end: string } | null;
  abcThresholdA: number;
  abcThresholdB: number;
  urgencyFactor: number;
  criticalAbcClasses: string[];
  lowTurnoverThreshold: number;
}

export type ConfigurationUpdate = Partial<Omit<Configuration, 'referenceDate' | 'effectiveReferenceDate' | 'datasetRange'>> & {
  referenceDate?: string | null;
};

export interface ThresholdOverride {
  itemId: number;
  sourceItemId: number;
  name: string;
  minRequired: number | null;
  maxCapacity: number | null;
}

export const CONFIGURATION_KEY = ['settings'] as const;
export const OVERRIDES_KEY = ['settings', 'overrides'] as const;

// A change recalculates everything, so every indicator the app has cached is stale.
const invalidateAll = (queryClient: ReturnType<typeof useQueryClient>) => queryClient.invalidateQueries();

export function useConfiguration() {
  return useQuery({ queryKey: CONFIGURATION_KEY, queryFn: () => api<Configuration>('/settings') });
}

export function useUpdateConfiguration() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: ConfigurationUpdate) => api<Configuration>('/settings', { method: 'PATCH', body }),
    onSuccess: () => invalidateAll(queryClient),
  });
}

export function useOverrides() {
  return useQuery({ queryKey: OVERRIDES_KEY, queryFn: () => api<ThresholdOverride[]>('/settings/overrides') });
}

/** Items to pick from when setting an override. */
export function useItemChoices() {
  return useQuery({
    queryKey: ['settings', 'item-choices'],
    queryFn: async () => (await api<{ items: { id: number; name: string }[] }>('/items')).items,
  });
}

/** A number sets that side, `null` clears it, `undefined` leaves it unchanged. */
export function useSetOverride() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ itemId, ...body }: { itemId: number; minRequired?: number | null; maxCapacity?: number | null }) =>
      api<ThresholdOverride | null>(`/settings/overrides/${itemId}`, { method: 'PUT', body }),
    onSuccess: () => invalidateAll(queryClient),
  });
}

export function useClearOverride() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (itemId: number) => api<void>(`/settings/overrides/${itemId}`, { method: 'DELETE' }),
    onSuccess: () => invalidateAll(queryClient),
  });
}
