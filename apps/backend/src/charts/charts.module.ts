// Chart endpoints (ticket 07). Both take the shared FilterQuery (ticket 06) and return the current period together
// with the previous period of the same length, so the frontend can overlay them. The series endpoint is generic:
// ticket 20 (Analysis) reuses it.
import { BadRequestException, Controller, Get, Injectable, Module, Query } from '@nestjs/common';
import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ABC_CLASSES, FilterQuery, parseFilters, resolvePeriod, selectSlice } from '../filters/filters';
import { computeIndicators, previousPeriod } from '../indicators/indicators';
import { loadIndicatorInputs } from '../indicators/load-indicators';
import type { AbcClass, IndicatorsResult, ItemIndicators, Period } from '../indicators/types';
import { PrismaService } from '../prisma/prisma.service';

export type AbcLevel = 'class' | 'category' | 'item';
const LEVELS: AbcLevel[] = ['class', 'category', 'item'];

/**
 * Drill-down of the ABC donut. `level=class` (default) shows the classes; `level=category&parentClass=A` the
 * Categories of class A; `level=item&parentClass=A&parentCategory=X` the Items of that Category.
 * (`abcClass` stays the shared filter; `parentClass` is the drill-down position.)
 */
export class AbcQuery extends FilterQuery {
  @IsOptional()
  @IsIn(LEVELS)
  level?: AbcLevel;

  @IsOptional()
  @IsIn(ABC_CLASSES as AbcClass[])
  parentClass?: AbcClass;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  parentCategory?: string;
}

export interface AbcSlice {
  /** Class letter, Category name or Item id, depending on the level. */
  key: string;
  label: string;
  stockValue: number;
  /** Share of the total Stock Value shown, in %. Null when the total is 0. */
  pct: number | null;
  itemCount: number;
  /** The same group's Stock Value in the previous period. Null when there is no comparison. */
  previousStockValue: number | null;
}

export interface AbcResponse {
  period: Period | null;
  previousPeriod: Period | null;
  level: AbcLevel;
  parentClass: AbcClass | null;
  parentCategory: string | null;
  totalStockValue: number;
  slices: AbcSlice[];
}

export interface SeriesPoint {
  /** Day offset from the start of its period (0 = first day). Current and previous align on it. */
  offset: number;
  date: string;
  stockValue: number;
  consumptionValue: number;
  /** Null when no Item has a state that day. */
  inventoryAvailabilityPct: number | null;
}

export interface SeriesResponse {
  referenceDate: string | null;
  period: Period | null;
  previousPeriod: Period | null;
  current: SeriesPoint[];
  /** Empty when no Item of the slice has a state in the previous period. */
  previous: SeriesPoint[];
}

export function pointsOf(result: IndicatorsResult): SeriesPoint[] {
  return result.valueSeries.map((v, offset) => ({
    offset,
    date: v.date,
    stockValue: v.stockValue,
    consumptionValue: v.consumptionValue,
    inventoryAvailabilityPct: result.availabilitySeries[offset].availabilityPct,
  }));
}

@Injectable()
export class ChartsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Current and previous indicators of the slice. Also used by the Analysis module (ticket 20). */
  async compute(query: FilterQuery) {
    const { from, to, filters } = parseFilters(query);
    const inputs = await loadIndicatorInputs(this.prisma);
    const period = resolvePeriod(inputs, from, to);
    if (!period) return { referenceDate: inputs.referenceDate, data: null };
    const rows = await this.prisma.item.findMany({ orderBy: { id: 'asc' } });
    const byId = new Map(rows.map((r) => [r.id, r]));
    const prev = previousPeriod(period);
    const config = inputs.settings.config;
    // As in the dashboard: the slice is decided on the current period, the comparison covers the same Items.
    const current = computeIndicators(inputs.items, period, config, selectSlice(filters, byId));
    const sliceIds = new Set(current.items.map((i) => i.itemId));
    const previous = computeIndicators(inputs.items, prev, config, (i) => sliceIds.has(i.itemId));
    return { referenceDate: inputs.referenceDate, data: { period, prev, byId, current, previous } };
  }

  async series(query: FilterQuery): Promise<SeriesResponse> {
    const { referenceDate, data } = await this.compute(query);
    if (!data) return { referenceDate, period: null, previousPeriod: null, current: [], previous: [] };
    return {
      referenceDate,
      period: data.period,
      previousPeriod: data.prev,
      current: pointsOf(data.current),
      previous: data.previous.portfolio.itemsWithState > 0 ? pointsOf(data.previous) : [],
    };
  }

  async abc(query: AbcQuery): Promise<AbcResponse> {
    const level = query.level ?? 'class';
    const parentClass = query.parentClass ?? null;
    const parentCategory = query.parentCategory ?? null;
    if (level !== 'class' && !parentClass) throw new BadRequestException(`level=${level} needs parentClass`);
    if (level === 'item' && !parentCategory) throw new BadRequestException('level=item needs parentCategory');
    if (level === 'class' && (parentClass || parentCategory)) throw new BadRequestException('level=class takes no parent');
    if (level === 'category' && parentCategory) throw new BadRequestException('level=category takes no parentCategory');

    const { data } = await this.compute(query);
    const base = { level, parentClass, parentCategory };
    if (!data) return { period: null, previousPeriod: null, ...base, totalStockValue: 0, slices: [] };

    const { byId } = data;
    const inParent = (r: ItemIndicators) =>
      r.stockValue !== null &&
      (level === 'class' || r.abcClass === parentClass) &&
      (level !== 'item' || byId.get(r.itemId)!.category === parentCategory);
    const keyOf = (r: ItemIndicators): { key: string; label: string } => {
      if (level === 'class') return { key: r.abcClass!, label: `Classe ${r.abcClass}` };
      const row = byId.get(r.itemId)!;
      return level === 'category' ? { key: row.category, label: row.category } : { key: String(row.id), label: row.name };
    };

    const currentItems = data.current.items.filter(inParent);
    const parentIds = new Set(currentItems.map((r) => r.itemId));
    const hasPrevious = data.previous.portfolio.itemsWithState > 0;
    // Previous period: at class level every Item of the slice, grouped by its class then; deeper, the Items of the parent group.
    const previousItems = data.previous.items.filter((r) => r.stockValue !== null && (level === 'class' || parentIds.has(r.itemId)));

    const groups = new Map<string, AbcSlice>();
    for (const r of currentItems) {
      const { key, label } = keyOf(r);
      const g = groups.get(key) ?? { key, label, stockValue: 0, pct: null, itemCount: 0, previousStockValue: hasPrevious ? 0 : null };
      g.stockValue += r.stockValue!;
      g.itemCount += 1;
      groups.set(key, g);
    }
    if (hasPrevious) {
      for (const r of previousItems) {
        const g = groups.get(keyOf(r).key);
        if (g) g.previousStockValue! += r.stockValue!;
      }
    }

    const total = currentItems.reduce((sum, r) => sum + r.stockValue!, 0);
    const slices = [...groups.values()];
    for (const g of slices) g.pct = total > 0 ? (g.stockValue / total) * 100 : null;
    slices.sort(
      level === 'class'
        ? (a, b) => a.key.localeCompare(b.key)
        : (a, b) => b.stockValue - a.stockValue || a.label.localeCompare(b.label),
    );
    return { period: data.period, previousPeriod: data.prev, ...base, totalStockValue: total, slices };
  }
}

@Controller('charts')
export class ChartsController {
  constructor(private readonly charts: ChartsService) {}

  /** ABC distribution by Stock Value with drill-down. Requires login (global guard). */
  @Get('abc')
  abc(@Query() query: AbcQuery): Promise<AbcResponse> {
    return this.charts.abc(query);
  }

  /** Daily Stock Value, consumption and Inventory Availability: current period and previous period. */
  @Get('series')
  series(@Query() query: FilterQuery): Promise<SeriesResponse> {
    return this.charts.series(query);
  }
}

@Module({ controllers: [ChartsController], providers: [ChartsService], exports: [ChartsService] })
export class ChartsModule {}
