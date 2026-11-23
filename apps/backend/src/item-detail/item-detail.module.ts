// Item detail (ticket 08): one Item's header, stock/usage history, trend, Estimated Demand and Vendor lead time.
//
// Decisions
//  - The Item's indicators come from the same `computeIndicators` pass over the whole portfolio as /api/items, so
//    its ABC Class and Urgency Level never depend on the filters. Only `from` and `to` of the shared filter apply.
//  - `series` is the carried-forward daily series (one point per day, stock null before the first Snapshot) with the
//    EFFECTIVE minimum and maximum (Threshold Overrides applied), as used by the indicators.
//  - `snapshots` are the real Snapshots dated inside the period, with their Data Quality Flags (a Snapshot is
//    flagged when any flag is true).
//  - Lead time mismatch: the Vendor's Contracted Lead Time and the observed Replenishment Time (period mean)
//    differ by more than 0 days (tolerance 1e-9 for floating point). Null when either side is unknown.
import { Controller, Get, Injectable, Module, NotFoundException, Param, ParseIntPipe, Query } from '@nestjs/common';
import { FilterQuery, parseFilters, resolvePeriod } from '../filters/filters';
import { computeIndicators, dayNumber, isoDay } from '../indicators/indicators';
import { loadIndicatorInputs } from '../indicators/load-indicators';
import type { ItemIndicators, Period } from '../indicators/types';
import { PrismaService } from '../prisma/prisma.service';

export interface DataQualityFlags {
  stockAboveMaxCapacity: boolean;
  minAboveMax: boolean;
  negativeValue: boolean;
  nonIntegerQuantity: boolean;
  duplicateSnapshot: boolean;
}

export interface SeriesPoint {
  date: string;
  /** Null before the Item's first Snapshot. */
  currentStock: number | null;
  minRequired: number | null;
  maxCapacity: number | null;
  avgUsagePerDay: number | null;
  replenishmentTimeDays: number | null;
}

export interface SnapshotRow extends DataQualityFlags {
  id: number;
  date: string;
  currentStock: number;
  minRequired: number;
  maxCapacity: number;
  unitCost: number;
  avgUsagePerDay: number;
  replenishmentTimeDays: number;
  /** True when at least one Data Quality Flag is set. */
  dataQuality: boolean;
}

export interface ItemDetailResponse {
  referenceDate: string | null;
  period: Period | null;
  item: {
    id: number;
    sourceItemId: number;
    name: string;
    category: string;
    vendorCode: string;
    vendorName: string;
  };
  /** Indicators as of the period end. Null when the dataset is empty. */
  indicators: Omit<ItemIndicators, 'itemId'> | null;
  thresholdOverride: { minRequired: number | null; maxCapacity: number | null } | null;
  /** Daily carried-forward series over the period. */
  series: SeriesPoint[];
  snapshots: SnapshotRow[];
  consumptionTrendPct: number | null;
  estimatedDemand30d: number | null;
  leadTime: {
    contractedDays: number | null;
    /** Mean Replenishment Time over the period. */
    observedDays: number | null;
    /** Contracted - observed. */
    differenceDays: number | null;
    /** True when they differ by more than 0 days. Null when either side is unknown. */
    mismatch: boolean | null;
  };
}

const toIso = (d: Date): string => d.toISOString().slice(0, 10);

@Injectable()
export class ItemDetailService {
  constructor(private readonly prisma: PrismaService) {}

  async detail(id: number, query: FilterQuery): Promise<ItemDetailResponse> {
    const { from, to } = parseFilters(query);
    const item = await this.prisma.item.findUnique({ where: { id }, include: { thresholdOverride: true } });
    if (!item) throw new NotFoundException(`Item ${id} not found`);
    const vendor = await this.prisma.vendor.findUnique({ where: { code: item.vendorCode } });
    const header = {
      id: item.id,
      sourceItemId: item.sourceItemId,
      name: item.name,
      category: item.category,
      vendorCode: item.vendorCode,
      vendorName: vendor?.name ?? item.vendorCode,
    };
    const override = item.thresholdOverride
      ? {
          minRequired: item.thresholdOverride.minRequired?.toNumber() ?? null,
          maxCapacity: item.thresholdOverride.maxCapacity?.toNumber() ?? null,
        }
      : null;
    const contracted = vendor?.contractedLeadTimeDays ?? null;

    const inputs = await loadIndicatorInputs(this.prisma);
    const period = resolvePeriod(inputs, from, to);
    if (!period) {
      return {
        referenceDate: inputs.referenceDate,
        period,
        item: header,
        indicators: null,
        thresholdOverride: override,
        series: [],
        snapshots: [],
        consumptionTrendPct: null,
        estimatedDemand30d: null,
        leadTime: { contractedDays: contracted, observedDays: null, differenceDays: null, mismatch: null },
      };
    }

    // The whole portfolio is classified (ABC Class), then only this Item is kept.
    const result = computeIndicators(inputs.items, period, inputs.settings.config, (r) => r.itemId === id);
    const { itemId: _itemId, ...indicators } = result.items[0];

    // Same carry-forward rule as the indicators: latest Snapshot on or before the day, later input wins ties.
    const input = inputs.items.find((i) => i.itemId === id)!;
    const sorted = input.snapshots
      .map((s, index) => ({ s, index, day: dayNumber(s.date) }))
      .sort((a, b) => a.day - b.day || a.index - b.index);
    const series: SeriesPoint[] = [];
    let pointer = -1;
    for (let day = dayNumber(period.start); day <= dayNumber(period.end); day++) {
      while (pointer + 1 < sorted.length && sorted[pointer + 1].day <= day) pointer++;
      if (pointer < 0) {
        series.push({ date: isoDay(day), currentStock: null, minRequired: null, maxCapacity: null, avgUsagePerDay: null, replenishmentTimeDays: null });
        continue;
      }
      const s = sorted[pointer].s;
      series.push({
        date: isoDay(day),
        currentStock: s.currentStock,
        minRequired: override?.minRequired ?? s.minRequired,
        maxCapacity: override?.maxCapacity ?? s.maxCapacity,
        avgUsagePerDay: s.avgUsagePerDay,
        replenishmentTimeDays: s.replenishmentTimeDays,
      });
    }

    const rows = await this.prisma.snapshot.findMany({
      where: { itemId: id, date: { gte: new Date(`${period.start}T00:00:00Z`), lte: new Date(`${period.end}T00:00:00Z`) } },
      orderBy: [{ date: 'asc' }, { id: 'asc' }],
    });
    const snapshots = rows.map((r): SnapshotRow => {
      const flags = {
        stockAboveMaxCapacity: r.stockAboveMaxCapacity,
        minAboveMax: r.minAboveMax,
        negativeValue: r.negativeValue,
        nonIntegerQuantity: r.nonIntegerQuantity,
        duplicateSnapshot: r.duplicateSnapshot,
      };
      return {
        id: r.id,
        date: toIso(r.date),
        currentStock: r.currentStock.toNumber(),
        minRequired: r.minRequired.toNumber(),
        maxCapacity: r.maxCapacity.toNumber(),
        unitCost: r.unitCost.toNumber(),
        avgUsagePerDay: r.avgUsagePerDay.toNumber(),
        replenishmentTimeDays: r.replenishmentTimeDays.toNumber(),
        ...flags,
        dataQuality: Object.values(flags).some(Boolean),
      };
    });

    const observed = indicators.replenishmentTimeDays;
    const difference = contracted !== null && observed !== null ? contracted - observed : null;
    return {
      referenceDate: inputs.referenceDate,
      period,
      item: header,
      indicators,
      thresholdOverride: override,
      series,
      snapshots,
      consumptionTrendPct: indicators.consumptionTrendPct,
      estimatedDemand30d: indicators.estimatedDemand30d,
      leadTime: {
        contractedDays: contracted,
        observedDays: observed,
        differenceDays: difference,
        mismatch: difference === null ? null : Math.abs(difference) > 1e-9,
      },
    };
  }
}

@Controller('items')
export class ItemDetailController {
  constructor(private readonly detail: ItemDetailService) {}

  /** Detail of one Item over the shared period filter (`from`, `to`). Requires login (global guard). */
  @Get(':id/detail')
  get(@Param('id', ParseIntPipe) id: number, @Query() query: FilterQuery): Promise<ItemDetailResponse> {
    return this.detail.detail(id, query);
  }
}

@Module({ controllers: [ItemDetailController], providers: [ItemDetailService] })
export class ItemDetailModule {}
