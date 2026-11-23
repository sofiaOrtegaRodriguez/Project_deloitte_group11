import { Controller, Get, Injectable, Module, Query } from '@nestjs/common';
import { FilterQuery, parseFilters, resolvePeriod, selectSlice } from '../filters/filters';
import { computeIndicators, previousPeriod } from '../indicators/indicators';
import { loadIndicatorInputs } from '../indicators/load-indicators';
import type { IndicatorsResult, Period, PortfolioIndicators, UrgencyLevel } from '../indicators/types';
import { PrismaService } from '../prisma/prisma.service';

const TOP_N = 10;

export interface KpiValues {
  stockValue: number;
  excessStockValue: number;
  inventoryAvailabilityPct: number | null;
  belowMinimumCount: number;
  medianAutonomyDays: number | null;
  weightedTurnover: number | null;
  meanReplenishmentTimeDays: number | null;
}
export type KpiKey = keyof KpiValues;
const KPI_KEYS: KpiKey[] = [
  'stockValue',
  'excessStockValue',
  'inventoryAvailabilityPct',
  'belowMinimumCount',
  'medianAutonomyDays',
  'weightedTurnover',
  'meanReplenishmentTimeDays',
];

export interface KpiDelta {
  /** current - previous. Null when either side is null. */
  absolute: number | null;
  /** Change relative to the previous value, in %. Null when either side is null or the previous is 0. */
  pct: number | null;
}

export interface TopItem {
  id: number;
  sourceItemId: number;
  name: string;
  category: string;
  urgencyLevel: UrgencyLevel;
  priorityScore: number;
  stockAutonomyDays: number | null;
  stockValue: number | null;
}

export interface DashboardResponse {
  referenceDate: string | null;
  period: Period | null;
  previousPeriod: Period | null;
  current: KpiValues | null;
  /** Null when no Item has a state in the previous period (nothing to compare with). */
  previous: KpiValues | null;
  deltas: Record<KpiKey, KpiDelta> | null;
  urgencyCounts: Record<UrgencyLevel, number>;
  topItems: TopItem[];
}

const kpis = (p: PortfolioIndicators): KpiValues => ({
  stockValue: p.stockValue,
  excessStockValue: p.excessStockValue,
  inventoryAvailabilityPct: p.inventoryAvailabilityPct,
  belowMinimumCount: p.belowMinimumCount,
  medianAutonomyDays: p.medianAutonomyDays,
  weightedTurnover: p.weightedTurnover,
  meanReplenishmentTimeDays: p.meanReplenishmentTimeDays,
});

function delta(current: number | null, previous: number | null): KpiDelta {
  if (current === null || previous === null) return { absolute: null, pct: null };
  return { absolute: current - previous, pct: previous === 0 ? null : ((current - previous) / Math.abs(previous)) * 100 };
}

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async get(query: FilterQuery): Promise<DashboardResponse> {
    const { from, to, filters } = parseFilters(query);

    const inputs = await loadIndicatorInputs(this.prisma);
    const period = resolvePeriod(inputs, from, to);
    if (!period) {
      return {
        referenceDate: inputs.referenceDate,
        period: null,
        previousPeriod: null,
        current: null,
        previous: null,
        deltas: null,
        urgencyCounts: { CRITICAL: 0, ATTENTION: 0, NORMAL: 0 },
        topItems: [],
      };
    }

    const rows = await this.prisma.item.findMany({ orderBy: { id: 'asc' } });
    const byId = new Map(rows.map((r) => [r.id, r]));
    const prevPeriod = previousPeriod(period);
    const config = inputs.settings.config;
    // The slice is decided on the current period; the comparison covers the same Items (see filters.ts).
    const current: IndicatorsResult = computeIndicators(inputs.items, period, config, selectSlice(filters, byId));
    const sliceIds = new Set(current.items.map((i) => i.itemId));
    const previous: IndicatorsResult = computeIndicators(inputs.items, prevPeriod, config, (i) => sliceIds.has(i.itemId));

    const currentKpis = kpis(current.portfolio);
    const previousKpis = kpis(previous.portfolio);
    const hasPrevious = previous.portfolio.itemsWithState > 0;
    const deltas = Object.fromEntries(
      KPI_KEYS.map((k) => [k, hasPrevious ? delta(currentKpis[k], previousKpis[k]) : { absolute: null, pct: null }]),
    ) as Record<KpiKey, KpiDelta>;

    const topItems = current.items
      .filter((i) => i.priorityScore !== null && i.urgencyLevel !== null && byId.has(i.itemId))
      .sort((a, b) => b.priorityScore! - a.priorityScore! || a.itemId - b.itemId)
      .slice(0, TOP_N)
      .map((i): TopItem => {
        const row = byId.get(i.itemId)!;
        return {
          id: row.id,
          sourceItemId: row.sourceItemId,
          name: row.name,
          category: row.category,
          urgencyLevel: i.urgencyLevel!,
          priorityScore: i.priorityScore!,
          stockAutonomyDays: i.stockAutonomyDays,
          stockValue: i.stockValue,
        };
      });

    return {
      referenceDate: inputs.referenceDate,
      period,
      previousPeriod: prevPeriod,
      current: currentKpis,
      previous: hasPrevious ? previousKpis : null,
      deltas,
      urgencyCounts: current.portfolio.urgencyCounts,
      topItems,
    };
  }
}

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  /** KPIs for the period and for the previous period of the same length. Requires login (global guard). */
  @Get()
  get(@Query() query: FilterQuery): Promise<DashboardResponse> {
    return this.dashboard.get(query);
  }
}

@Module({ controllers: [DashboardController], providers: [DashboardService], exports: [DashboardService] })
export class DashboardModule {}
