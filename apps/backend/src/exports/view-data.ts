// The "view data" assembler shared by the exports (ticket 22: CSV, Excel) and the PDF report (ticket 23).
// It takes the same FilterQuery as the views and returns everything an export states or tabulates: the filters in
// human-readable form, the Reference Date, the KPIs and the tables. It knows nothing about file formats.
import { Injectable } from '@nestjs/common';
import { DashboardService } from '../dashboard/dashboard.module';
import type { KpiKey } from '../dashboard/dashboard.module';
import { FilterQuery, parseFilters } from '../filters/filters';
import { ItemsService } from '../items/items.module';
import type { Period } from '../indicators/types';
import { PrismaService } from '../prisma/prisma.service';
import { RecommendationsService } from '../recommendations/recommendations.service';

export type Cell = string | number | null;

export interface Column {
  header: string;
  /** Numbers are written as numbers (Excel) / plain decimals (CSV). */
  type: 'text' | 'number';
}

export interface ViewTable {
  /** Sheet name (Excel). */
  name: string;
  columns: Column[];
  rows: Cell[][];
}

export interface ViewKpi {
  key: KpiKey;
  label: string;
  unit: string;
  value: number | null;
  /** Same Items over the previous period of the same length. Null when there is nothing to compare with. */
  previous: number | null;
  deltaAbsolute: number | null;
  deltaPct: number | null;
}

export interface ViewData {
  referenceDate: string | null;
  period: Period | null;
  previousPeriod: Period | null;
  /** Human-readable active filters, e.g. { label: 'Category', value: 'Consumable, Equipment' }. */
  filters: { label: string; value: string }[];
  kpis: ViewKpi[];
  /** Inventory (one row per Item of the slice), Top Items by urgency, Recommendations of the slice's Items. */
  inventory: ViewTable;
  topItems: ViewTable;
  recommendations: ViewTable;
}

const KPI_META: { key: KpiKey; label: string; unit: string }[] = [
  { key: 'stockValue', label: 'Stock Value', unit: 'currency' },
  { key: 'excessStockValue', label: 'Excess Stock Value', unit: 'currency' },
  { key: 'inventoryAvailabilityPct', label: 'Inventory Availability', unit: '%' },
  { key: 'belowMinimumCount', label: 'Items Below Minimum', unit: 'items' },
  { key: 'medianAutonomyDays', label: 'Median Stock Autonomy', unit: 'days' },
  { key: 'weightedTurnover', label: 'Weighted Stock Turnover', unit: 'times/year' },
  { key: 'meanReplenishmentTimeDays', label: 'Mean Replenishment Time', unit: 'days' },
];

const words = (v: string) => v.charAt(0) + v.slice(1).toLowerCase().replaceAll('_', ' ');

@Injectable()
export class ViewDataService {
  constructor(
    private readonly items: ItemsService,
    private readonly dashboard: DashboardService,
    private readonly recommendations: RecommendationsService,
    private readonly prisma: PrismaService,
  ) {}

  /** Throws 400 on bad filters (same validation as the views). */
  async assemble(query: FilterQuery): Promise<ViewData> {
    const parsed = parseFilters(query);
    const [inventory, dash] = await Promise.all([this.items.list(query), this.dashboard.get(query)]);
    const sliceIds = new Set(inventory.items.map((i) => i.id));
    const recs = (await this.recommendations.list()).filter((r) => sliceIds.has(r.itemId));

    const vendorNames = new Map((await this.prisma.vendor.findMany()).map((v) => [v.code, v.name]));
    const itemNames = new Map(
      (await this.prisma.item.findMany({ where: { id: { in: parsed.filters.itemIds } } })).map((i) => [i.id, `${i.name} (${i.sourceItemId})`]),
    );
    const f = parsed.filters;
    const filters: ViewData['filters'] = [];
    const add = (label: string, values: string[]) => {
      if (values.length) filters.push({ label, value: values.join(', ') });
    };
    if (parsed.from || parsed.to) {
      filters.push({ label: 'Period', value: `${inventory.period?.start ?? parsed.from} to ${inventory.period?.end ?? parsed.to}` });
    }
    add('Item', f.itemIds.map((id) => itemNames.get(id) ?? String(id)));
    add('Category', f.categories);
    add('Vendor', f.vendors.map((c) => (vendorNames.has(c) ? `${vendorNames.get(c)} (${c})` : c)));
    add('ABC Class', f.abcClasses);
    add('Urgency Level', f.urgencyLevels.map(words));
    add('Stock Status', f.stockStatuses.map(words));

    const kpis: ViewKpi[] = KPI_META.map(({ key, label, unit }) => ({
      key,
      label,
      unit,
      value: dash.current?.[key] ?? null,
      previous: dash.previous?.[key] ?? null,
      deltaAbsolute: dash.deltas?.[key].absolute ?? null,
      deltaPct: dash.deltas?.[key].pct ?? null,
    }));

    return {
      referenceDate: inventory.referenceDate,
      period: inventory.period,
      previousPeriod: inventory.previousPeriod,
      filters,
      kpis,
      inventory: {
        name: 'Inventory',
        columns: [
          { header: 'Item ID', type: 'number' },
          { header: 'Item', type: 'text' },
          { header: 'Category', type: 'text' },
          { header: 'Vendor Code', type: 'text' },
          { header: 'Vendor', type: 'text' },
          { header: 'Snapshot Date', type: 'text' },
          { header: 'Current Stock', type: 'number' },
          { header: 'Min Required', type: 'number' },
          { header: 'Max Capacity', type: 'number' },
          { header: 'Stock Autonomy (days)', type: 'number' },
          { header: 'Stock Turnover (per year)', type: 'number' },
          { header: 'Replenishment Time (days)', type: 'number' },
          { header: 'Stock Value', type: 'number' },
          { header: 'ABC Class', type: 'text' },
          { header: 'Stock Status', type: 'text' },
          { header: 'Urgency Level', type: 'text' },
          { header: 'Priority Score', type: 'number' },
        ],
        rows: inventory.items.map((i) => [
          i.sourceItemId,
          i.name,
          i.category,
          i.vendorCode,
          i.vendorName,
          i.state?.snapshotDate ?? null,
          i.state?.currentStock ?? null,
          i.state?.minRequired ?? null,
          i.state?.maxCapacity ?? null,
          i.stockAutonomyDays,
          i.stockTurnover,
          i.replenishmentTimeDays,
          i.stockValue,
          i.abcClass,
          i.stockStatus ? words(i.stockStatus) : null,
          i.urgencyLevel ? words(i.urgencyLevel) : null,
          i.priorityScore,
        ]),
      },
      topItems: {
        name: 'Top Items',
        columns: [
          { header: 'Rank', type: 'number' },
          { header: 'Item ID', type: 'number' },
          { header: 'Item', type: 'text' },
          { header: 'Category', type: 'text' },
          { header: 'Urgency Level', type: 'text' },
          { header: 'Priority Score', type: 'number' },
          { header: 'Stock Autonomy (days)', type: 'number' },
          { header: 'Stock Value', type: 'number' },
        ],
        rows: dash.topItems.map((t, index) => [
          index + 1,
          t.sourceItemId,
          t.name,
          t.category,
          words(t.urgencyLevel),
          t.priorityScore,
          t.stockAutonomyDays,
          t.stockValue,
        ]),
      },
      recommendations: {
        name: 'Recommendations',
        columns: [
          { header: 'Recommendation ID', type: 'number' },
          { header: 'Type', type: 'text' },
          { header: 'Status', type: 'text' },
          { header: 'Item', type: 'text' },
          { header: 'Quantity', type: 'number' },
          { header: 'Estimated Cost', type: 'number' },
          { header: 'Priority Score', type: 'number' },
          { header: 'Justification', type: 'text' },
          { header: 'Created By', type: 'text' },
          { header: 'Created At', type: 'text' },
        ],
        rows: recs.map((r) => [
          r.id,
          words(r.type),
          words(r.status),
          r.itemName,
          r.quantity,
          r.estimatedCost,
          r.priorityScore,
          r.justification,
          r.createdBy?.name ?? 'System',
          r.createdAt,
        ]),
      },
    };
  }
}
