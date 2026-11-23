'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { formatMoney, useRanking, type RankingRow } from '@/lib/planning';

const URGENCY_STYLE: Record<string, string> = {
  CRITICAL: 'bg-red-100 text-red-800',
  ATTENTION: 'bg-amber-100 text-amber-800',
  NORMAL: 'bg-muted text-muted-foreground',
};

/** Items ranked by Urgency Level then Priority Score, with the reasons and the suggested action. */
export function RankingTable({ onCreate }: { onCreate: (row: RankingRow) => void }) {
  const { data, isPending, error } = useRanking();
  const [showAll, setShowAll] = useState(false);

  if (isPending) return <p className="text-muted-foreground">Loading…</p>;
  if (error) return <p role="alert" className="text-destructive">{error.message}</p>;
  const rows = showAll ? data.items : data.items.filter((r) => r.urgencyLevel !== 'NORMAL' || r.holdPurchasesSuggested);

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Urgency ranking</h2>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          {data.referenceDate && <span>Reference Date {data.referenceDate}</span>}
          <Button size="sm" variant="outline" onClick={() => setShowAll((v) => !v)}>
            {showAll ? 'Only Items needing action' : 'Show all Items'}
          </Button>
        </div>
      </div>
      {rows.length === 0 && <p className="text-muted-foreground">No Items need action.</p>}
      {rows.length > 0 && (
        <div className="overflow-x-auto rounded-md border bg-background">
          <table className="w-full text-left text-sm">
            <thead className="border-b bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2">#</th>
                <th className="px-3 py-2">Item</th>
                <th className="px-3 py-2">Urgency</th>
                <th className="px-3 py-2 text-right">Priority</th>
                <th className="px-3 py-2">Why</th>
                <th className="px-3 py-2 text-right">Suggested</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((row) => (
                <tr key={row.itemId} className="align-top">
                  <td className="px-3 py-2">{row.rank}</td>
                  <td className="px-3 py-2">
                    <div className="font-medium">{row.name}</div>
                    <div className="text-xs text-muted-foreground">{row.category}</div>
                  </td>
                  <td className="px-3 py-2">
                    <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${URGENCY_STYLE[row.urgencyLevel]}`}>
                      {row.urgencyLevel.charAt(0) + row.urgencyLevel.slice(1).toLowerCase()}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right">{row.priorityScore === null ? '-' : row.priorityScore.toFixed(1)}</td>
                  <td className="px-3 py-2">
                    <ul className="list-disc pl-4 text-xs">
                      {row.reasons.map((reason) => (
                        <li key={reason}>{reason}</li>
                      ))}
                    </ul>
                  </td>
                  <td className="px-3 py-2 text-right text-xs">
                    <div>
                      Replenish {row.suggestedQuantity} units ({formatMoney(row.suggestedCost)})
                    </div>
                    {row.holdPurchasesSuggested && <div>Hold Purchases frees {formatMoney(row.freedCapital)}</div>}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Button size="sm" variant="outline" onClick={() => onCreate(row)}>
                      Create Recommendation
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
