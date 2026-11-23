'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import { useCurrentUser, type Role } from './auth';

export type AccountStatus = 'PENDING' | 'ACTIVE' | 'REJECTED' | 'REMOVED';

export interface UserSummary {
  id: number;
  name: string;
  email: string;
  role: Role;
  status: AccountStatus;
  createdAt: string;
}

export const USERS_KEY = ['users'] as const;
export const PENDING_COUNT_KEY = ['users', 'pending-count'] as const;

export function useRegister() {
  return useMutation({
    mutationFn: (body: { name: string; email: string; password: string }) =>
      api<{ message: string }>('/auth/register', { method: 'POST', body }),
  });
}

/** Users with the given Account Statuses (all when omitted). Director only. */
export function useUsers(statuses?: AccountStatus[]) {
  const query = statuses ? `?status=${statuses.join(',')}` : '';
  return useQuery({
    queryKey: [...USERS_KEY, statuses ?? 'all'],
    queryFn: () => api<UserSummary[]>(`/users${query}`),
  });
}

/** Number of Pending Access Requests; `undefined` for Users who can't manage Users (no request is made). */
export function usePendingCount(): number | undefined {
  const { data: user } = useCurrentUser();
  const { data } = useQuery({
    queryKey: PENDING_COUNT_KEY,
    queryFn: () => api<{ count: number }>('/users/pending-count'),
    enabled: user?.role === 'DIRECTOR',
    refetchInterval: 30_000,
  });
  return user?.role === 'DIRECTOR' ? data?.count : undefined;
}

/** Approve or reject an Access Request, then refresh the list and the badge. */
export function useDecideRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, decision }: { id: number; decision: 'approve' | 'reject' }) =>
      api<UserSummary>(`/users/${id}/${decision}`, { method: 'POST' }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: USERS_KEY }),
  });
}
