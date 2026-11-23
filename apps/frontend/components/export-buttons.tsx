'use client';

import { Download } from 'lucide-react';
import { useFilters } from '@/lib/filters';

const base = '/api/exports';
const link =
  'inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-accent hover:text-accent-foreground';

/**
 * Downloads the current view with the current URL filters. Plain anchors: the browser sends the session cookie
 * through the /api proxy and the server answers with Content-Disposition: attachment.
 */
export function ExportButtons({ csv = false, excel = false }: { csv?: boolean; excel?: boolean }) {
  const { query } = useFilters();
  const suffix = query ? `?${query}` : '';
  return (
    <div className="flex gap-2">
      {csv && (
        <a href={`${base}/inventory.csv${suffix}`} download className={link}>
          <Download className="h-4 w-4" aria-hidden /> Export CSV
        </a>
      )}
      {excel && (
        <a href={`${base}/view.xlsx${suffix}`} download className={link}>
          <Download className="h-4 w-4" aria-hidden /> Export Excel
        </a>
      )}
    </div>
  );
}
