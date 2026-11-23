'use client';

// Global Filters (ticket 06). The state lives in the URL query string, with the same parameter names as the
// backend (`from`, `to`, `itemId`, `category`, `vendor`, `abcClass`, `urgencyLevel`, `stockStatus`); multi-value
// filters repeat the parameter. Pages read it with `useFilters()`, call the API with `filterQuery(filters)` and
// link to Items with `withFilters('/inventory/3', filters)` so the filters survive the navigation.
import { useQuery } from '@tanstack/react-query';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useMemo } from 'react';
import { api } from './api';

export interface Filters {
  from?: string;
  to?: string;
  itemId: string[];
  category: string[];
  vendor: string[];
  abcClass: string[];
  urgencyLevel: string[];
  stockStatus: string[];
}

export const MULTI_KEYS = ['itemId', 'category', 'vendor', 'abcClass', 'urgencyLevel', 'stockStatus'] as const;
export type MultiKey = (typeof MULTI_KEYS)[number];

export const EMPTY_FILTERS: Filters = {
  itemId: [],
  category: [],
  vendor: [],
  abcClass: [],
  urgencyLevel: [],
  stockStatus: [],
};

/** Reads the filters from a query string (the URL's, or any URLSearchParams-like). Unknown parameters are ignored. */
export function parseFilters(params: { get(name: string): string | null; getAll(name: string): string[] }): Filters {
  return {
    from: params.get('from') || undefined,
    to: params.get('to') || undefined,
    itemId: params.getAll('itemId').filter(Boolean),
    category: params.getAll('category').filter(Boolean),
    vendor: params.getAll('vendor').filter(Boolean),
    abcClass: params.getAll('abcClass').filter(Boolean),
    urgencyLevel: params.getAll('urgencyLevel').filter(Boolean),
    stockStatus: params.getAll('stockStatus').filter(Boolean),
  };
}

/** The query string for the filters, without the leading "?". It is the one format used by the URL and the API. */
export function filterQuery(filters: Filters): string {
  const params = new URLSearchParams();
  if (filters.from) params.set('from', filters.from);
  if (filters.to) params.set('to', filters.to);
  for (const key of MULTI_KEYS) for (const value of filters[key]) params.append(key, value);
  return params.toString();
}

/** Appends the filters to a path, e.g. a link to an Item that keeps the current filters. */
export function withFilters(path: string, filters: Filters): string {
  const query = filterQuery(filters);
  return query ? `${path}?${query}` : path;
}

export function hasFilters(filters: Filters): boolean {
  return filterQuery(filters) !== '';
}

/** The current filters (from the URL) and the functions to change them. Needs a Suspense boundary above it. */
export function useFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const filters = useMemo(() => parseFilters(searchParams), [searchParams]);

  const setFilters = useCallback(
    (patch: Partial<Filters>) => {
      const query = filterQuery({ ...filters, ...patch });
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [filters, pathname, router],
  );
  const clearFilters = useCallback(() => router.replace(pathname, { scroll: false }), [pathname, router]);

  return { filters, query: filterQuery(filters), setFilters, clearFilters, active: hasFilters(filters) };
}

export interface FilterOptions {
  categories: string[];
  vendors: { code: string; name: string }[];
  items: { id: number; sourceItemId: number; name: string }[];
}

export function useFilterOptions() {
  return useQuery({
    queryKey: ['filter-options'],
    queryFn: () => api<FilterOptions>('/filters/options'),
    staleTime: 60_000,
  });
}
