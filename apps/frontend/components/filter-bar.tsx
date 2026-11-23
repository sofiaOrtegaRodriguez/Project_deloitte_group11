'use client';

import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useFilterOptions, useFilters, type MultiKey } from '@/lib/filters';

interface Option {
  value: string;
  label: string;
}

const ABC: Option[] = [
  { value: 'A', label: 'A' },
  { value: 'B', label: 'B' },
  { value: 'C', label: 'C' },
];
const URGENCY: Option[] = [
  { value: 'CRITICAL', label: 'Critical' },
  { value: 'ATTENTION', label: 'Attention' },
  { value: 'NORMAL', label: 'Normal' },
];
const STATUS: Option[] = [
  { value: 'BELOW_MINIMUM', label: 'Below Minimum' },
  { value: 'REORDER_NEEDED', label: 'Reorder Needed' },
  { value: 'EXCESS', label: 'Excess' },
  { value: 'NORMAL', label: 'Normal' },
];

/** A select that adds values to a multi-value filter, with removable chips for the chosen ones. */
function MultiPick({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: Option[];
  selected: string[];
  onChange: (values: string[]) => void;
}) {
  const labelOf = (value: string) => options.find((o) => o.value === value)?.label ?? value;
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-muted-foreground">
        {label}
        <select
          aria-label={label}
          className="mt-1 block h-9 rounded-md border border-input bg-background px-2 text-sm"
          value=""
          onChange={(e) => e.target.value && onChange([...selected, e.target.value])}
        >
          <option value="">{selected.length === 0 ? 'All' : 'Add…'}</option>
          {options
            .filter((o) => !selected.includes(o.value))
            .map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
        </select>
      </label>
      {selected.length > 0 && (
        <ul className="flex flex-wrap gap-1">
          {selected.map((value) => (
            <li key={value}>
              <button
                type="button"
                aria-label={`Remove ${label} ${labelOf(value)}`}
                className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-xs ring-1 ring-border hover:bg-accent"
                onClick={() => onChange(selected.filter((v) => v !== value))}
              >
                {labelOf(value)}
                <X className="size-3" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** The Global Filters bar: period, Item, Category, Vendor, ABC Class, Urgency Level, Stock Status. State is in the URL. */
export function FilterBar() {
  const { filters, setFilters, clearFilters, active } = useFilters();
  const { data: options } = useFilterOptions();
  const multi = (key: MultiKey) => (values: string[]) => setFilters({ [key]: values });

  return (
    <section aria-label="Filters" className="flex flex-wrap items-start gap-3 rounded-lg border bg-background p-3">
      <label className="text-xs text-muted-foreground">
        From
        <Input
          type="date"
          aria-label="From"
          className="mt-1 w-40"
          value={filters.from ?? ''}
          max={filters.to}
          onChange={(e) => setFilters({ from: e.target.value || undefined })}
        />
      </label>
      <label className="text-xs text-muted-foreground">
        To
        <Input
          type="date"
          aria-label="To"
          className="mt-1 w-40"
          value={filters.to ?? ''}
          min={filters.from}
          onChange={(e) => setFilters({ to: e.target.value || undefined })}
        />
      </label>
      <MultiPick
        label="Item"
        options={(options?.items ?? []).map((i) => ({ value: String(i.id), label: `${i.name} #${i.sourceItemId}` }))}
        selected={filters.itemId}
        onChange={multi('itemId')}
      />
      <MultiPick
        label="Category"
        options={(options?.categories ?? []).map((c) => ({ value: c, label: c }))}
        selected={filters.category}
        onChange={multi('category')}
      />
      <MultiPick
        label="Vendor"
        options={(options?.vendors ?? []).map((v) => ({ value: v.code, label: v.name }))}
        selected={filters.vendor}
        onChange={multi('vendor')}
      />
      <MultiPick label="ABC Class" options={ABC} selected={filters.abcClass} onChange={multi('abcClass')} />
      <MultiPick label="Urgency Level" options={URGENCY} selected={filters.urgencyLevel} onChange={multi('urgencyLevel')} />
      <MultiPick label="Stock Status" options={STATUS} selected={filters.stockStatus} onChange={multi('stockStatus')} />
      <Button type="button" variant="outline" className="mt-5" disabled={!active} onClick={clearFilters}>
        Clear all filters
      </Button>
    </section>
  );
}
