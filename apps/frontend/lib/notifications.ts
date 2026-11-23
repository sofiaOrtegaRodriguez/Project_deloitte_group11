'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';

export type NotificationType =
  | 'ALERT_CREATED'
  | 'ALERT_ESCALATED'
  | 'ALERT_REOPENED'
  | 'REMINDER'
  | 'DRAFT_STALE'
  | 'RECOMMENDATION_DECISION';

export interface AppNotification {
  id: number;
  type: NotificationType;
  alertId: number | null;
  itemId: number | null;
  recommendationId: number | null;
  message: string;
  createdAt: string;
  readAt: string | null;
}

export interface NotificationList {
  notifications: AppNotification[];
  unreadCount: number;
}

export const NOTIFICATIONS_KEY = ['notifications'] as const;

/** How often the inbox is polled (no WebSockets). The one place to tune it. */
export const NOTIFICATIONS_POLL_MS = 20_000;

/**
 * The polled Notifications of the logged-in User, newest first, with the unread count.
 * Ticket 13's Reminder toasts watch this for new REMINDER entries.
 */
export function useNotifications() {
  return useQuery({
    queryKey: NOTIFICATIONS_KEY,
    queryFn: () => api<NotificationList>('/notifications'),
    refetchInterval: NOTIFICATIONS_POLL_MS,
  });
}

function useInboxMutation<V>(request: (variables: V) => Promise<unknown>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: request,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_KEY }),
  });
}

export function useMarkNotificationRead() {
  return useInboxMutation((id: number) => api(`/notifications/${id}/read`, { method: 'POST' }));
}

export function useMarkAllNotificationsRead() {
  return useInboxMutation(() => api('/notifications/read-all', { method: 'POST' }));
}
