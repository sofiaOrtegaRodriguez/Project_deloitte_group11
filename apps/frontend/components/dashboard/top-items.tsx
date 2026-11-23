import Link from 'next/link';
import type { TopItem } from '@/lib/dashboard';
import { URGENCY_DOT, URGENCY_LABEL } from './urgency-counts';

const eur = new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const num1 = new Intl.NumberFormat('pt-PT', { maximumFractionDigits: 1 });

/** The 10 Items with the highest Priority Score. Each row links to the Item detail (`/inventory/[id]`, ticket 08). */
export function TopItems({ items }: { items: TopItem[] }) {
  return (
    <section aria-label="Top 10 Items by Priority Score" className="rounded-lg border bg-background">
      <h2 className="border-b px-3 py-2 text-sm font-medium">Top 10 by Priority Score</h2>
      {items.length === 0 ? (
        <p className="p-3 text-sm text-muted-foreground">No Items to rank.</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr className="text-left">
              <th className="px-3 py-1.5 font-normal">#</th>
              <th className="px-3 py-1.5 font-normal">Item</th>
              <th className="px-3 py-1.5 font-normal">Urgency</th>
              <th className="px-3 py-1.5 text-right font-normal">Priority Score</th>
              <th className="px-3 py-1.5 text-right font-normal">Autonomy</th>
              <th className="px-3 py-1.5 text-right font-normal">Stock Value</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {items.map((item, index) => (
              <tr key={item.id} data-testid="top-item" className="hover:bg-muted">
                <td className="px-3 py-1.5 tabular-nums text-muted-foreground">{index + 1}</td>
                <td className="px-3 py-1.5">
                  <Link href={`/inventory/${item.id}`} className="font-medium hover:underline">
                    {item.name}
                  </Link>
                  <span className="ml-2 text-xs text-muted-foreground">{item.category}</span>
                </td>
                <td className="px-3 py-1.5">
                  <span className="inline-flex items-center gap-1.5">
                    <span className={`size-2 rounded-full ${URGENCY_DOT[item.urgencyLevel]}`} aria-hidden />
                    {URGENCY_LABEL[item.urgencyLevel]}
                  </span>
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums">{num1.format(item.priorityScore)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">
                  {item.stockAutonomyDays === null ? '–' : `${num1.format(item.stockAutonomyDays)} d`}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums">
                  {item.stockValue === null ? '–' : eur.format(item.stockValue)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
