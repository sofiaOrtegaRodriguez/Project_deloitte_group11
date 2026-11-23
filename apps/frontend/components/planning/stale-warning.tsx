'use client';

import { Button } from '@/components/ui/button';
import { useUpdateToCurrent, type Recommendation } from '@/lib/planning';

const FIELD_LABELS: Record<string, string> = {
  suggestedQuantity: 'Suggested quantity',
  freedCapital: 'Capital freed',
  currentStock: 'Stock',
  minRequired: 'Min Required',
  maxCapacity: 'Max Capacity',
  unitCost: 'Unit cost',
  replenishmentTimeDays: 'Replenishment Time (days)',
  stockAutonomyDays: 'Stock autonomy (days)',
  priorityScore: 'Priority Score',
  abcClass: 'ABC Class',
  urgencyLevel: 'Urgency Level',
  stockStatus: 'Stock status',
};

const show = (v: number | string | boolean | null): string =>
  v === null ? '-' : typeof v === 'number' ? String(Math.round(v * 100) / 100) : String(v);

/** "Data has changed" warning of a Stale Draft: old vs current figures and the "Update to current data" button. */
export function StaleWarning({ rec }: { rec: Recommendation }) {
  const update = useUpdateToCurrent();
  if (!rec.stale) return null;

  return (
    <div role="alert" className="space-y-2 rounded-md border border-amber-400 bg-amber-50 p-2 text-xs text-amber-900">
      <p className="font-medium">
        Data has changed since this Draft was made
        {rec.staleSince && <> (noticed {new Date(rec.staleSince).toLocaleString()})</>}.
      </p>
      {rec.oldVsCurrent.length > 0 && (
        <table className="w-full text-left">
          <thead>
            <tr>
              <th className="font-medium">Figure</th>
              <th className="font-medium">Draft</th>
              <th className="font-medium">Current</th>
            </tr>
          </thead>
          <tbody>
            {rec.oldVsCurrent.map((c) => (
              <tr key={c.field}>
                <td>{FIELD_LABELS[c.field] ?? c.field}</td>
                <td>{show(c.old)}</td>
                <td>{show(c.current)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {update.error && <p className="text-destructive">{update.error.message}</p>}
      <Button size="sm" disabled={update.isPending} onClick={() => update.mutate(rec.id)}>
        Update to current data
      </Button>
    </div>
  );
}
