'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from './api';

export type AbcClass = 'A' | 'B' | 'C';
export type StockStatus = 'BELOW_MINIMUM' | 'REORDER_NEEDED' | 'EXCESS' | 'NORMAL';
export type UrgencyLevel = 'CRITICAL' | 'ATTENTION' | 'NORMAL';

/** One Item as returned by GET /api/items (only the fields the UI uses). */
export interface ItemRow {
  id: number;
  sourceItemId: number;
  name: string;
  category: string;
  vendorCode: string;
  vendorName: string;
  hasState: boolean;
  state: { currentStock: number; minRequired: number; maxCapacity: number } | null;
  stockAutonomyDays: number | null;
  stockTurnover: number | null;
  replenishmentTimeDays: number | null;
  abcClass: AbcClass | null;
  belowMinimum: boolean | null;
  stockStatus: StockStatus | null;
  urgencyLevel: UrgencyLevel | null;
  stockValue: number | null;
  lowTurnover: boolean | null;
}

export interface ItemsResponse {
  referenceDate: string | null;
  items: ItemRow[];
}

export function useItems() {
  return useQuery({ queryKey: ['items'], queryFn: () => api<ItemsResponse>('/items') });
}
