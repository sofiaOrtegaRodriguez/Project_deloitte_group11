'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';

export type AlertLevel = 'CRITICAL' | 'ATTENTION';
export type AlertStatus = 'NEW' | 'VIEWED' | 'ACKNOWLEDGED' | 'IGNORED' | 'RESOLVED' | 'CLEARED';
export type ManualAlertStatus = 'VIEWED' | 'ACKNOWLEDGED' | 'IGNORED' | 'RESOLVED';

export interface AlertSummary {
  id: number;
  itemId: number;
  itemName: string;
  category: string;
  level: AlertLevel;
  status: AlertStatus;
  priorityScore: number | null;
  reminderCount: number;
  reason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AlertEvent {
  id: number;
  type: 'CREATED' | 'ESCALATED' | 'LEVEL_LOWERED' | 'STATUS_CHANGED' | 'REOPENED' | 'CLEARED' | 'COMMENTED';
  fromStatus: AlertStatus | null;
  toStatus: AlertStatus | null;
  fromLevel: AlertLevel | null;
  toLevel: AlertLevel | null;
  /** Null means "system". */
  user: { id: number; name: string } | null;
  comment: string | null;
  note: string | null;
  createdAt: string;
}

export interface AlertDetail extends AlertSummary {
  events: AlertEvent[];
}

export const ALERTS_KEY = ['alerts'] as const;

export const STATUS_LABELS: Record<AlertStatus, string> = {
  NEW: 'New',
  VIEWED: 'Viewed',
  ACKNOWLEDGED: 'Acknowledged',
  IGNORED: 'Ignored',
  RESOLVED: 'Resolved',
  CLEARED: 'Cleared',
};

export const LEVEL_LABELS: Record<AlertLevel, string> = { CRITICAL: 'Critical', ATTENTION: 'Attention' };

export const MANUAL_STATUSES: ManualAlertStatus[] = ['VIEWED', 'ACKNOWLEDGED', 'IGNORED', 'RESOLVED'];

/** Open Alerts ordered by Urgency Level then Priority Score. */
export function useAlerts() {
  return useQuery({ queryKey: [...ALERTS_KEY, 'list'], queryFn: () => api<AlertSummary[]>('/alerts') });
}

export function useAlertDetail(id: number, enabled = true) {
  return useQuery({ queryKey: [...ALERTS_KEY, 'detail', id], queryFn: () => api<AlertDetail>(`/alerts/${id}`), enabled });
}

/** Every Alert of an Item, with history and comments (for the Item detail page). */
export function useItemAlerts(itemId: number) {
  return useQuery({ queryKey: [...ALERTS_KEY, 'item', itemId], queryFn: () => api<AlertDetail[]>(`/items/${itemId}/alerts`) });
}

function useAlertMutation<V>(request: (variables: V) => Promise<AlertDetail>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: request,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ALERTS_KEY }),
  });
}

export function useChangeAlertStatus() {
  return useAlertMutation(({ id, status }: { id: number; status: ManualAlertStatus }) =>
    api<AlertDetail>(`/alerts/${id}/status`, { method: 'POST', body: { status } }),
  );
}

export function useCommentOnAlert() {
  return useAlertMutation(({ id, comment }: { id: number; comment: string }) =>
    api<AlertDetail>(`/alerts/${id}/comments`, { method: 'POST', body: { comment } }),
  );
}
