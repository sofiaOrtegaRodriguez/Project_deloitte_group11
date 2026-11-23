'use client';

// Chart data (ticket 07). Everything comes from the backend; `query` is `filterQuery(filters)` (lib/filters.ts).
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api } from './api';
import type { Period } from './dashboard';

export type AbcLevel = 'class' | 'category' | 'item';

export interface AbcSlice {
  key: string;
  label: string;
  stockValue: number;
  pct: number | null;
  itemCount: number;
  previousStockValue: number | null;
}

export interface AbcData {
  period: Period | null;
  previousPeriod: Period | null;
  level: AbcLevel;
  parentClass: string | null;
  parentCategory: string | null;
  totalStockValue: number;
  slices: AbcSlice[];
}

export interface SeriesPoint {
  offset: number;
  date: string;
  stockValue: number;
  consumptionValue: number;
  inventoryAvailabilityPct: number | null;
}

export interface SeriesData {
  referenceDate: string | null;
  period: Period | null;
  previousPeriod: Period | null;
  current: SeriesPoint[];
  previous: SeriesPoint[];
}

/** Where the ABC donut is: the classes, the Categories of a class, or the Items of a Category. */
export interface AbcDrill {
  parentClass?: string;
  parentCategory?: string;
}

export function useAbc(query: string, drill: AbcDrill) {
  const params = new URLSearchParams(query);
  if (drill.parentClass) {
    params.set('level', drill.parentCategory ? 'item' : 'category');
    params.set('parentClass', drill.parentClass);
    if (drill.parentCategory) params.set('parentCategory', drill.parentCategory);
  }
  const qs = params.toString();
  return useQuery({
    queryKey: ['charts-abc', qs],
    queryFn: () => api<AbcData>(`/charts/abc${qs ? `?${qs}` : ''}`),
    placeholderData: keepPreviousData,
  });
}

export function useSeries(query: string) {
  return useQuery({
    queryKey: ['charts-series', query],
    queryFn: () => api<SeriesData>(`/charts/series${query ? `?${query}` : ''}`),
  });
}
