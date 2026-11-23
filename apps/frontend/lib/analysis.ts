'use client';

// Analysis data (ticket 20). Everything comes from the backend; `query` is `filterQuery(filters)` (lib/filters.ts).
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api } from './api';
import type { Period } from './dashboard';

export interface TrendPoint {
  offset: number;
  date: string;
  stockValue: number;
  consumptionValue: number;
  inventoryAvailabilityPct: number | null;
  excessStockValue: number;
  belowMinimumCount: number;
  medianAutonomyDays: number | null;
  stockTurnover: number | null;
  replenishmentTimeDays: number | null;
}

export interface TrendsData {
  referenceDate: string | null;
  period: Period | null;
  previousPeriod: Period | null;
  current: TrendPoint[];
  previous: TrendPoint[];
}

export type CompareBy = 'category' | 'vendor' | 'abcClass';

export interface GroupKpis {
  itemCount: number;
  stockValue: number;
  excessStockValue: number;
  inventoryAvailabilityPct: number | null;
  medianAutonomyDays: number | null;
  averageAutonomyDays: number | null;
  weightedTurnover: number | null;
  meanReplenishmentTimeDays: number | null;
  belowMinimumCount: number;
}

export interface GroupRow {
  key: string;
  label: string;
  current: GroupKpis;
  previous: GroupKpis | null;
}

export interface GroupsData {
  referenceDate: string | null;
  period: Period | null;
  previousPeriod: Period | null;
  groups: GroupRow[];
}

export interface TrendingItem {
  itemId: number;
  name: string;
  category: string;
  vendorCode: string;
  abcClass: string | null;
  trendPct: number;
  avgUsagePerDay: number;
  minRequired: number;
  maxCapacity: number;
  stockStatus: string | null;
}

export interface ConsumptionTrendsData {
  minPct: number;
  top: number;
  rising: TrendingItem[];
  falling: TrendingItem[];
}

const withQuery = (query: string, extra: Record<string, string>) => {
  const params = new URLSearchParams(query);
  for (const [k, v] of Object.entries(extra)) params.set(k, v);
  return params.toString();
};

export function useTrends(query: string) {
  return useQuery({
    queryKey: ['analysis-trends', query],
    queryFn: () => api<TrendsData>(`/analysis/trends${query ? `?${query}` : ''}`),
  });
}

export function useCompare(query: string, by: CompareBy) {
  const qs = withQuery(query, { by });
  return useQuery({
    queryKey: ['analysis-compare', qs],
    queryFn: () => api<GroupsData>(`/analysis/compare?${qs}`),
    placeholderData: keepPreviousData,
  });
}

export function useConsumptionTrends(query: string, minPct: number, top: number) {
  const qs = withQuery(query, { minPct: String(minPct), top: String(top) });
  return useQuery({
    queryKey: ['analysis-consumption-trends', qs],
    queryFn: () => api<ConsumptionTrendsData>(`/analysis/consumption-trends?${qs}`),
    placeholderData: keepPreviousData,
  });
}

export function useCategorySummary(query: string) {
  return useQuery({
    queryKey: ['analysis-category-summary', query],
    queryFn: () => api<GroupsData>(`/analysis/category-summary${query ? `?${query}` : ''}`),
  });
}
