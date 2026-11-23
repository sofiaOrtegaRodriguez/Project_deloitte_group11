'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from './api';

export type UrgencyLevel = 'CRITICAL' | 'ATTENTION' | 'NORMAL';

export interface KpiValues {
  stockValue: number;
  excessStockValue: number;
  inventoryAvailabilityPct: number | null;
  belowMinimumCount: number;
  medianAutonomyDays: number | null;
  weightedTurnover: number | null;
  meanReplenishmentTimeDays: number | null;
}
export type KpiKey = keyof KpiValues;

export interface KpiDelta {
  absolute: number | null;
  pct: number | null;
}

export interface TopItem {
  id: number;
  sourceItemId: number;
  name: string;
  category: string;
  urgencyLevel: UrgencyLevel;
  priorityScore: number;
  stockAutonomyDays: number | null;
  stockValue: number | null;
}

export interface Period {
  start: string;
  end: string;
}

export interface DashboardData {
  referenceDate: string | null;
  period: Period | null;
  previousPeriod: Period | null;
  current: KpiValues | null;
  previous: KpiValues | null;
  deltas: Record<KpiKey, KpiDelta> | null;
  urgencyCounts: Record<UrgencyLevel, number>;
  topItems: TopItem[];
}

/** Dashboard data for the period. Other tickets add their filters to `params` (same names as the API). */
export function useDashboard(params: Record<string, string | undefined> = {}) {
  const search = new URLSearchParams(Object.entries(params).filter((e): e is [string, string] => !!e[1])).toString();
  return useQuery({
    queryKey: ['dashboard', search],
    queryFn: () => api<DashboardData>(`/dashboard${search ? `?${search}` : ''}`),
  });
}
