import { BadRequestException, Controller, Get, Injectable, Module, Query } from '@nestjs/common';
import { IsOptional, Matches } from 'class-validator';
import { computeIndicators, dayNumber, previousPeriod } from '../indicators/indicators';
import { loadIndicatorInputs } from '../indicators/load-indicators';
import type { IndicatorsResult, ItemInput, Period, PortfolioIndicators, UrgencyLevel } from '../indicators/types';
import { PrismaService } from '../prisma/prisma.service';

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const TOP_N = 10;

export class DashboardQuery {
  /** First day of the period. Default: the first date in the dataset. */
  @IsOptional()
  @Matches(ISO_DAY, { message: 'from must be a date like 2026-02-12' })
  from?: string;

  /** Last day of the period. Default: the Reference Date. */
  @IsOptional()
  @Matches(ISO_DAY, { message: 'to must be a date like 2026-02-12' })
  to?: string;
}

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

/** Filter set applied to the Items before computing. Ticket 06 adds the shared filters here. */
export type DashboardSlice = Record<string, never>;

/** The one place that selects which Items the dashboard covers. Today: all of them. */
export function selectSlice(items: ItemInput[], _slice: DashboardSlice): ItemInput[] {
  return items;
}

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async get(query: DashboardQuery): Promise<DashboardResponse> {
    const { from, to } = query;
    for (const date of [from, to]) {
      // Date.parse rolls impossible days over, so check the round trip.
      if (date && new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date) {
        throw new BadRequestException(`Invalid date: ${date}`);
      }
    }
    if (from && to && dayNumber(from) > dayNumber(to)) throw new BadRequestException('from must not be after to');

    const inputs = await loadIndicatorInputs(this.prisma);
    const end = to ?? inputs.referenceDate;
    if (!end || !inputs.datasetRange) {
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
    const start = from ?? (inputs.datasetRange.start < end ? inputs.datasetRange.start : end);
    if (dayNumber(start) > dayNumber(end)) throw new BadRequestException(`Invalid period: ${start} is after ${end}`);

    const items = selectSlice(inputs.items, {});
    const period: Period = { start, end };
    const prevPeriod = previousPeriod(period);
    const config = inputs.settings.config;
    const current: IndicatorsResult = computeIndicators(items, period, config);
    const previous: IndicatorsResult = computeIndicators(items, prevPeriod, config);

    const currentKpis = kpis(current.portfolio);
    const previousKpis = kpis(previous.portfolio);
    const hasPrevious = previous.portfolio.itemsWithState > 0;
    const deltas = Object.fromEntries(
      KPI_KEYS.map((k) => [k, hasPrevious ? delta(currentKpis[k], previousKpis[k]) : { absolute: null, pct: null }]),
    ) as Record<KpiKey, KpiDelta>;

    const rows = await this.prisma.item.findMany({ orderBy: { id: 'asc' } });
    const byId = new Map(rows.map((r) => [r.id, r]));
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
  get(@Query() query: DashboardQuery): Promise<DashboardResponse> {
    return this.dashboard.get(query);
  }
}

@Module({ controllers: [DashboardController], providers: [DashboardService] })
export class DashboardModule {}
