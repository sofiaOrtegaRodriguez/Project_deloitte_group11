'use client';

import { ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { useAbc, type AbcDrill } from '@/lib/charts';
import { formatDecimal, formatEur, formatInteger } from '@/lib/format';

// Teal and neutral shades only: red/amber/green are reserved for urgency.
const SHADES = ['#0f766e', '#14b8a6', '#5eead4', '#64748b', '#94a3b8', '#cbd5e1', '#115e59', '#2dd4bf', '#99f6e4', '#475569'];

/** ABC distribution of Stock Value. Click a class to see its Categories, then a Category to see its Items. */
export function AbcDonut({ query }: { query: string }) {
  const [drill, setDrill] = useState<AbcDrill>({});
  const { data, isPending, error } = useAbc(query, drill);

  const title = !drill.parentClass
    ? 'Stock Value by ABC Class'
    : !drill.parentCategory
      ? `Categories in class ${drill.parentClass}`
      : `Items in ${drill.parentCategory}`;

  const onSliceClick = (key: string) => {
    if (!drill.parentClass) setDrill({ parentClass: key });
    else if (!drill.parentCategory) setDrill({ parentClass: drill.parentClass, parentCategory: key });
  };
  const canDrill = !drill.parentCategory;

  return (
    <section aria-label="ABC distribution" className="rounded-lg border bg-background">
      <h2 className="border-b px-3 py-2 text-sm font-medium">{title}</h2>
      <nav aria-label="ABC drill-down" className="flex items-center gap-1 px-3 pt-2 text-xs text-muted-foreground">
        <button type="button" className="hover:underline" onClick={() => setDrill({})} disabled={!drill.parentClass}>
          All classes
        </button>
        {drill.parentClass && (
          <>
            <ChevronRight className="size-3" aria-hidden />
            <button
              type="button"
              className="hover:underline"
              onClick={() => setDrill({ parentClass: drill.parentClass })}
              disabled={!drill.parentCategory}
            >
              Class {drill.parentClass}
            </button>
          </>
        )}
        {drill.parentCategory && (
          <>
            <ChevronRight className="size-3" aria-hidden />
            <span>{drill.parentCategory}</span>
          </>
        )}
      </nav>
      <div className="p-3">
        {isPending && <p className="text-sm text-muted-foreground">Loading…</p>}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error.message}
          </p>
        )}
        {data &&
          (data.slices.length === 0 ? (
            <p className="text-sm text-muted-foreground">No Stock Value to show.</p>
          ) : (
            <div className="flex flex-col items-center gap-3 sm:flex-row">
              <div className="h-56 w-56 shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={data.slices}
                      dataKey="stockValue"
                      nameKey="label"
                      innerRadius="55%"
                      outerRadius="90%"
                      paddingAngle={1}
                      onClick={(_, index) => canDrill && onSliceClick(data.slices[index].key)}
                      cursor={canDrill ? 'pointer' : 'default'}
                      isAnimationActive={false}
                    >
                      {data.slices.map((s, i) => (
                        <Cell key={s.key} fill={SHADES[i % SHADES.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value) => formatEur(Number(value))} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="w-full min-w-0 flex-1 space-y-1 text-sm">
                {data.slices.map((s, i) => (
                  <li key={s.key}>
                    <button
                      type="button"
                      data-testid="abc-slice"
                      className="flex w-full items-center gap-2 rounded px-1 py-0.5 text-left hover:bg-muted disabled:cursor-default disabled:hover:bg-transparent"
                      disabled={!canDrill}
                      onClick={() => onSliceClick(s.key)}
                    >
                      <span className="size-2.5 shrink-0 rounded-sm" style={{ background: SHADES[i % SHADES.length] }} aria-hidden />
                      <span className="min-w-0 flex-1 truncate">{s.label}</span>
                      <span className="tabular-nums text-muted-foreground">{formatInteger(s.itemCount)} Items</span>
                      <span className="w-24 text-right tabular-nums">{formatEur(s.stockValue)}</span>
                      <span className="w-12 text-right tabular-nums text-muted-foreground">
                        {s.pct === null ? '–' : `${formatDecimal(s.pct)} %`}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
      </div>
    </section>
  );
}
