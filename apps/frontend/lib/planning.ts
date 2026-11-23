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
  SUBMITTED: 'Submitted',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
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
  details: { comment?: string | null } | null;
}

/** The Item's indicators frozen when the Draft was submitted. */
export interface IndicatorSnapshot {
  takenAt: string;
  referenceDate: string | null;
  quantity: number;
  estimatedCost: number;
  justification: string;
  figures: Record<string, unknown>;
  indicators: {
    urgencyLevel: string | null;
    priorityScore: number | null;
    abcClass: string | null;
    stockAutonomyDays: number | null;
    replenishmentTimeDays: number | null;
    stockValue: number | null;
    state: { currentStock?: number; minRequired?: number; maxCapacity?: number } | null;
  } | null;
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
  createdBy: Person | null;
  discardReason: string | null;
  submittedBy: Person | null;
  submittedAt: string | null;
  decidedBy: Person | null;
  decidedAt: string | null;
  decisionComment: string | null;
  approvedAt: string | null;
  indicatorSnapshot: IndicatorSnapshot | null;
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

export function useSubmitRecommendation() {
  return useRecommendationMutation(({ id }: { id: number }) =>
    api<Recommendation>(`/recommendations/${id}/submit`, { method: 'POST' }),
  );
}

export function useApproveRecommendation() {
  return useRecommendationMutation(({ id }: { id: number }) =>
    api<Recommendation>(`/recommendations/${id}/approve`, { method: 'POST' }),
  );
}

export function useRejectRecommendation() {
  return useRecommendationMutation(({ id, comment }: { id: number; comment: string }) =>
    api<Recommendation>(`/recommendations/${id}/reject`, { method: 'POST', body: { comment } }),
  );
}

/** The 5 Pending Approval Recommendations with the highest Priority Score (Dashboard widget). */
export function useTopPendingRecommendations(limit = 5) {
  return useQuery({
    queryKey: [...RECOMMENDATIONS_KEY, 'top-pending', limit],
    queryFn: () => api<Recommendation[]>(`/recommendations/top-pending?limit=${limit}`),
  });
}

export const formatMoney = (n: number): string =>
  n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
