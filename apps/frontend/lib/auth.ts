'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { api, ApiError } from './api';

export type Role = 'DIRECTOR' | 'PROCUREMENT_TEAM';

export interface CurrentUser {
  id: number;
  name: string;
  email: string;
  role: Role;
}

export const ROLE_LABELS: Record<Role, string> = {
  DIRECTOR: 'Director',
  PROCUREMENT_TEAM: 'Procurement Team',
};

export const ME_KEY = ['auth', 'me'] as const;

/**
 * The logged-in User, or `null` when there is no valid session (the app shell then goes to Login).
 * Never cached for long: it is checked again whenever the window regains focus, so a removal
 * is noticed straight away.
 */
export function useCurrentUser() {
  return useQuery({
    queryKey: ME_KEY,
    queryFn: async (): Promise<CurrentUser | null> => {
      try {
        return (await api<{ user: CurrentUser }>('/auth/me')).user;
      } catch (error) {
        if (error instanceof ApiError && error.isSessionLost) return null;
        throw error;
      }
    },
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
}

export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (credentials: { email: string; password: string }) =>
      api<{ user: CurrentUser }>('/auth/login', { method: 'POST', body: credentials }),
    onSuccess: ({ user }) => queryClient.setQueryData(ME_KEY, user),
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  const router = useRouter();
  return useMutation({
    mutationFn: () => api<void>('/auth/logout', { method: 'POST' }),
    onSuccess: () => {
      queryClient.clear();
      router.replace('/login');
    },
  });
}
