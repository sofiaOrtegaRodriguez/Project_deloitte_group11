'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from './api';
import type { AbcClass, StockStatus, UrgencyLevel } from './items';

export interface SeriesPoint {
  date: string;
  currentStock: number | null;
  minRequired: number | null;
  maxCapacity: number | null;
  avgUsagePerDay: number | null;
  replenishmentTimeDays: number | null;
}

export interface SnapshotRow {
  id: number;
  date: string;
  currentStock: number;
  minRequired: number;
  maxCapacity: number;
  unitCost: number;
  avgUsagePerDay: number;
  replenishmentTimeDays: number;
  stockAboveMaxCapacity: boolean;
  minAboveMax: boolean;
  negativeValue: boolean;
  nonIntegerQuantity: boolean;
  duplicateSnapshot: boolean;
  dataQuality: boolean;
}

/** GET /api/items/:id/detail (only the fields the UI uses). */
export interface ItemDetail {
  referenceDate: string | null;
  period: { start: string; end: string } | null;
  item: { id: number; sourceItemId: number; name: string; category: string; vendorCode: string; vendorName: string };
  indicators: {
    hasState: boolean;
    state: { currentStock: number; minRequired: number; maxCapacity: number; unitCost: number } | null;
    stockAutonomyDays: number | null;
    stockTurnover: number | null;
    replenishmentTimeDays: number | null;
    abcClass: AbcClass | null;
    stockStatus: StockStatus | null;
    urgencyLevel: UrgencyLevel | null;
    stockValue: number | null;
  } | null;
  thresholdOverride: { minRequired: number | null; maxCapacity: number | null } | null;
  series: SeriesPoint[];
  snapshots: SnapshotRow[];
  consumptionTrendPct: number | null;
  estimatedDemand30d: number | null;
  leadTime: {
    contractedDays: number | null;
    observedDays: number | null;
    differenceDays: number | null;
    mismatch: boolean | null;
  };
}

/** Detail of one Item. `query` carries the period (`from`, `to`) of the URL filters. */
export function useItemDetail(id: number, query = '') {
  return useQuery({
    queryKey: ['item-detail', id, query],
    queryFn: () => api<ItemDetail>(`/items/${id}/detail${query ? `?${query}` : ''}`),
    enabled: Number.isInteger(id),
  });
}

export const FLAG_LABELS: Record<
  'stockAboveMaxCapacity' | 'minAboveMax' | 'negativeValue' | 'nonIntegerQuantity' | 'duplicateSnapshot',
  string
> = {
  stockAboveMaxCapacity: 'Stock above maximum capacity',
  minAboveMax: 'Minimum above maximum',
  negativeValue: 'Negative value',
  nonIntegerQuantity: 'Non-integer quantity',
  duplicateSnapshot: 'Duplicate Snapshot',
};
