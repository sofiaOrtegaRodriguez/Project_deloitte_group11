'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';

export type RecommendationType = 'REPLENISH' | 'HOLD_PURCHASES';
export type RecommendationStatus = 'DRAFT' | 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED' | 'DISCARDED';
export type UrgencyLevel = 'CRITICAL' | 'ATTENTION' | 'NORMAL';

export const TYPE_LABELS: Record<RecommendationType, string> = {
  REPLENISH: 'Replenish',
  HOLD_PURCHASES: 'Hold Purchases',
};

export const STATUS_LABELS: Record<RecommendationStatus, string> = {
  DRAFT: 'Draft',
  PENDING_APPROVAL: 'Pending Approval',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  DISCARDED: 'Discarded',
};

export const EVENT_LABELS: Record<string, string> = {
  CREATED: 'Created',
  EDITED: 'Edited',
  DISCARDED: 'Discarded',
  UPDATED_TO_CURRENT: 'Updated to current data',
};

export interface RankingRow {
  rank: number;
  itemId: number;
  name: string;
  category: string;
  urgencyLevel: UrgencyLevel;
  priorityScore: number | null;
  abcClass: string | null;
  currentStock: number;
  stockAutonomyDays: number | null;
  replenishmentTimeDays: number;
  reasons: string[];
  suggestedQuantity: number;
  suggestedCost: number;
  freedCapital: number;
  holdPurchasesSuggested: boolean;
}

export interface Person {
  id: number;
  name: string;
  removed: boolean;
}

export interface HistoryEvent {
  id: number;
  type: string;
  user: Person | null;
  at: string;
}

export interface Recommendation {
  id: number;
  type: RecommendationType;
  status: RecommendationStatus;
  itemId: number;
  itemName: string;
  quantity: number;
  estimatedCost: number;
  priorityScore: number | null;
  justification: string;
  figures: { freedCapital: number };
  /** Stale Draft: the data changed since the Draft was made. */
  stale: boolean;
  staleSince: string | null;
  oldVsCurrent: { field: string; old: number | string | boolean | null; current: number | string | boolean | null }[];
  createdBy: Person | null;
  discardReason: string | null;
  createdAt: string;
  history: HistoryEvent[];
}

const RANKING_KEY = ['planning', 'ranking'] as const;
const RECOMMENDATIONS_KEY = ['recommendations'] as const;

export function useRanking() {
  return useQuery({
    queryKey: RANKING_KEY,
    queryFn: () => api<{ referenceDate: string | null; items: RankingRow[] }>('/planning/ranking'),
  });
}

/** Recommendations, optionally of a single Item (also used by the Item detail page). */
export function useRecommendations(itemId?: number) {
  return useQuery({
    queryKey: [...RECOMMENDATIONS_KEY, itemId ?? 'all'],
    queryFn: () => api<Recommendation[]>(itemId === undefined ? '/recommendations' : `/items/${itemId}/recommendations`),
  });
}

function useRecommendationMutation<TVars>(fn: (vars: TVars) => Promise<Recommendation>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSettled: () => queryClient.invalidateQueries({ queryKey: RECOMMENDATIONS_KEY }),
  });
}

export function useCreateRecommendation() {
  return useRecommendationMutation((body: { itemId: number; type: RecommendationType; quantity?: number; justification?: string }) =>
    api<Recommendation>('/recommendations', { method: 'POST', body }),
  );
}

export function useEditRecommendation() {
  return useRecommendationMutation(({ id, ...body }: { id: number; quantity?: number; justification?: string }) =>
    api<Recommendation>(`/recommendations/${id}`, { method: 'PATCH', body }),
  );
}

export function useDiscardRecommendation() {
  return useRecommendationMutation(({ id, reason }: { id: number; reason?: string }) =>
    api<Recommendation>(`/recommendations/${id}/discard`, { method: 'POST', body: { reason } }),
  );
}

export function useUpdateToCurrent() {
  return useRecommendationMutation((id: number) =>
    api<Recommendation>(`/recommendations/${id}/update-to-current`, { method: 'POST' }),
  );
}

export const formatMoney = (n: number): string =>
  n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
