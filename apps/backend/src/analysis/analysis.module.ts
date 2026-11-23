// Analysis endpoints (ticket 20). All take the shared FilterQuery (ticket 06) and return the current period together
// with the previous period of the same length (same Items), so the frontend can overlay or compare them.
//   GET /api/analysis/trends             daily series of every indicator, previous period aligned by day offset
//   GET /api/analysis/compare?by=...     KPIs per Category, Vendor or ABC Class
//   GET /api/analysis/consumption-trends Items with rising / falling consumption (business question 3)
//   GET /api/analysis/category-summary   Consumables vs Equipment summary
import { BadRequestException, Controller, Get, Injectable, Module, Query } from '@nestjs/common';
import { Allow, IsIn } from 'class-validator';
import { ChartsModule, ChartsService, pointsOf, type SeriesPoint } from '../charts/charts.module';
import { FilterQuery } from '../filters/filters';
import { portfolioOf } from '../indicators/indicators';
import type { AbcClass, DailyIndicatorPoint, IndicatorsResult, ItemIndicators, Period, StockStatus } from '../indicators/types';

export const COMPARE_DIMENSIONS = ['category', 'vendor', 'abcClass'] as const;
export type CompareDimension = (typeof COMPARE_DIMENSIONS)[number];

export class CompareQuery extends FilterQuery {
  @IsIn(COMPARE_DIMENSIONS as unknown as string[])
  by!: CompareDimension;
}

export class ConsumptionTrendsQuery extends FilterQuery {
  /** Minimum |trend %| for an Item to be listed. Default 10. */
  @Allow()
  minPct?: string;

  /** Maximum number of Items per list. Default 10. */
  @Allow()
  top?: string;
}

export interface TrendPoint extends SeriesPoint, Omit<DailyIndicatorPoint, 'date' | 'stockValue'> {}

export interface TrendsResponse {
  referenceDate: string | null;
  period: Period | null;
  previousPeriod: Period | null;
  current: TrendPoint[];
  /** Empty when no Item of the slice has a state in the previous period. */
  previous: TrendPoint[];
}

export interface GroupKpis {
  itemCount: number;
  stockValue: number;
  excessStockValue: number;
  inventoryAvailabilityPct: number | null;
  medianAutonomyDays: number | null;
  /** Mean of the Items' Stock Autonomy (days). Null when no Item consumes stock. */
  averageAutonomyDays: number | null;
  weightedTurnover: number | null;
  meanReplenishmentTimeDays: number | null;
  belowMinimumCount: number;
}

export interface GroupRow {
  key: string;
  label: string;
  current: GroupKpis;
  /** Null when the group had no Item with a state in the previous period. */
  previous: GroupKpis | null;
}

export interface GroupsResponse {
  referenceDate: string | null;
  period: Period | null;
  previousPeriod: Period | null;
  groups: GroupRow[];
}

export interface CompareResponse extends GroupsResponse {
  by: CompareDimension;
}

export interface TrendingItem {
  itemId: number;
  name: string;
  category: string;
  vendorCode: string;
  abcClass: AbcClass | null;
  /** % change in mean usage between the first and the second half of the period. */
  trendPct: number;
  avgUsagePerDay: number;
  minRequired: number;
  maxCapacity: number;
  stockStatus: StockStatus | null;
}

export interface ConsumptionTrendsResponse {
  referenceDate: string | null;
  period: Period | null;
  previousPeriod: Period | null;
  minPct: number;
  top: number;
  /** Highest rise first. */
  rising: TrendingItem[];
  /** Steepest fall first. */
  falling: TrendingItem[];
}

const mean = (values: number[]): number | null =>
  values.length === 0 ? null : values.reduce((sum, v) => sum + v, 0) / values.length;

/** The KPIs of a set of Item indicators (the Items without a state are ignored). */
export function groupKpis(items: ItemIndicators[]): GroupKpis {
  const withState = items.filter((i) => i.hasState);
  const p = portfolioOf(withState);
  return {
    itemCount: p.itemsWithState,
    stockValue: p.stockValue,
    excessStockValue: p.excessStockValue,
    inventoryAvailabilityPct: p.inventoryAvailabilityPct,
    medianAutonomyDays: p.medianAutonomyDays,
    averageAutonomyDays: mean(withState.map((i) => i.stockAutonomyDays).filter((v): v is number => v !== null)),
    weightedTurnover: p.weightedTurnover,
    meanReplenishmentTimeDays: p.meanReplenishmentTimeDays,
    belowMinimumCount: p.belowMinimumCount,
  };
}

/** Parses an optional non-negative number query parameter (400 when it is not one). `integer` also requires 1..100. */
function numberParam(name: string, value: unknown, fallback: number, integer: boolean): number {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || !/^\d+(\.\d+)?$/.test(value)) throw new BadRequestException(`${name} must be a non-negative number`);
  const n = Number(value);
  if (integer && (!Number.isInteger(n) || n < 1 || n > 100)) throw new BadRequestException(`${name} must be a whole number from 1 to 100`);
  return n;
}

@Injectable()
export class AnalysisService {
  constructor(private readonly charts: ChartsService) {}

  private header(data: { period: Period; prev: Period } | null, referenceDate: string | null) {
    return { referenceDate, period: data?.period ?? null, previousPeriod: data?.prev ?? null };
  }

  async trends(query: FilterQuery): Promise<TrendsResponse> {
    const { referenceDate, data } = await this.charts.compute(query);
    if (!data) return { ...this.header(null, referenceDate), current: [], previous: [] };
    // Stock Value, consumption and availability come from the charts series; the rest from the daily indicator series.
    const withExtras = (r: IndicatorsResult): TrendPoint[] =>
      pointsOf(r).map((p, i) => {
        const { date: _date, stockValue: _stockValue, ...extra } = r.dailySeries[i];
        return { ...p, ...extra };
      });
    return {
      ...this.header(data, referenceDate),
      current: withExtras(data.current),
      previous: data.previous.portfolio.itemsWithState > 0 ? withExtras(data.previous) : [],
    };
  }

  private async groups(query: FilterQuery, by: CompareDimension) {
    const { referenceDate, data } = await this.charts.compute(query);
    if (!data) return { referenceDate, data: null, groups: [] as GroupRow[] };
    const keyOf = (r: ItemIndicators): string => {
      const row = data.byId.get(r.itemId)!;
      return by === 'category' ? row.category : by === 'vendor' ? row.vendorCode : r.abcClass!;
    };
    // Items with no state have no ABC Class and nothing to show: they are left out of every group.
    const bucket = (items: ItemIndicators[]) => {
      const map = new Map<string, ItemIndicators[]>();
      for (const r of items.filter((i) => i.hasState)) {
        const key = keyOf(r);
        map.set(key, [...(map.get(key) ?? []), r]);
      }
      return map;
    };
    const current = bucket(data.current.items);
    // Previous period: the same Items, each with the group (and ABC Class) it had then.
    const previous = bucket(data.previous.items);
    const keys = [...current.keys()].sort((a, b) => a.localeCompare(b));
    const groups: GroupRow[] = keys.map((key) => ({
      key,
      label: by === 'abcClass' ? `Class ${key}` : key,
      current: groupKpis(current.get(key)!),
      previous: previous.has(key) ? groupKpis(previous.get(key)!) : null,
    }));
    return { referenceDate, data, groups };
  }

  async compare(query: CompareQuery): Promise<CompareResponse> {
    const { referenceDate, data, groups } = await this.groups(query, query.by);
    return { ...this.header(data, referenceDate), by: query.by, groups };
  }

  async categorySummary(query: FilterQuery): Promise<GroupsResponse> {
    const { referenceDate, data, groups } = await this.groups(query, 'category');
    return { ...this.header(data, referenceDate), groups };
  }

  async consumptionTrends(query: ConsumptionTrendsQuery): Promise<ConsumptionTrendsResponse> {
    const minPct = numberParam('minPct', query.minPct, 10, false);
    const top = numberParam('top', query.top, 10, true);
    const { referenceDate, data } = await this.charts.compute(query);
    const base = { ...this.header(data, referenceDate), minPct, top };
    if (!data) return { ...base, rising: [], falling: [] };
    const all: TrendingItem[] = [];
    for (const r of data.current.items) {
      if (!r.hasState || r.consumptionTrendPct === null) continue;
      const row = data.byId.get(r.itemId)!;
      all.push({
        itemId: r.itemId,
        name: row.name,
        category: row.category,
        vendorCode: row.vendorCode,
        abcClass: r.abcClass,
        trendPct: r.consumptionTrendPct,
        avgUsagePerDay: r.state!.avgUsagePerDay,
        minRequired: r.state!.minRequired,
        maxCapacity: r.state!.maxCapacity,
        stockStatus: r.stockStatus,
      });
    }
    const rising = all.filter((i) => i.trendPct > 0 && i.trendPct >= minPct).sort((a, b) => b.trendPct - a.trendPct || a.itemId - b.itemId);
    const falling = all.filter((i) => i.trendPct < 0 && i.trendPct <= -minPct).sort((a, b) => a.trendPct - b.trendPct || a.itemId - b.itemId);
    return { ...base, rising: rising.slice(0, top), falling: falling.slice(0, top) };
  }
}

@Controller('analysis')
export class AnalysisController {
  constructor(private readonly analysis: AnalysisService) {}

  /** Daily series of every indicator: current period and previous period. Requires login (global guard). */
  @Get('trends')
  trends(@Query() query: FilterQuery): Promise<TrendsResponse> {
    return this.analysis.trends(query);
  }

  /** KPIs per Category, Vendor or ABC Class, current and previous period. */
  @Get('compare')
  compare(@Query() query: CompareQuery): Promise<CompareResponse> {
    return this.analysis.compare(query);
  }

  /** Items with rising and falling consumption: candidates for a threshold review. */
  @Get('consumption-trends')
  consumptionTrends(@Query() query: ConsumptionTrendsQuery): Promise<ConsumptionTrendsResponse> {
    return this.analysis.consumptionTrends(query);
  }

  /** Summary by Category (Consumables vs Equipment), current and previous period. */
  @Get('category-summary')
  categorySummary(@Query() query: FilterQuery): Promise<GroupsResponse> {
    return this.analysis.categorySummary(query);
  }
}

@Module({ imports: [ChartsModule], controllers: [AnalysisController], providers: [AnalysisService] })
export class AnalysisModule {}
