'use client';

import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { ApiError } from '@/lib/api';
import { ME_KEY } from '@/lib/auth';

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => {
    // Any request that finds the session gone (401) marks the User as logged out;
    // the app shell then sends them to Login.
    const onError = (error: Error) => {
      if (error instanceof ApiError && error.isSessionLost) client.setQueryData(ME_KEY, null);
    };
    const client: QueryClient = new QueryClient({
      queryCache: new QueryCache({ onError }),
      mutationCache: new MutationCache({ onError }),
      defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
    });
    return client;
  });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
