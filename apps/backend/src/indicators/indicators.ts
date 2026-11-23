// The pure indicators module (ADR 0003, spec "Indicators module"). No I/O, no clock, no database:
// it receives every Item's Snapshots plus the configuration and returns the indicators for a period.
// To compare periods, call `computeIndicators` twice, the second time with `previousPeriod(period)`.
import type {
  AbcClass,
  AvailabilityPoint,
  IndicatorConfig,
  IndicatorsResult,
  ItemIndicators,
  ItemInput,
  ItemState,
  Period,
  PortfolioIndicators,
  SnapshotInput,
  StockStatus,
  UrgencyLevel,
} from './types';

const DAY_MS = 86_400_000;
const DAYS_PER_YEAR = 365;
const ESTIMATED_DEMAND_DAYS = 30;
const ESTIMATED_DEMAND_SNAPSHOTS = 3;

/** Whole days since 1970-01-01 for an ISO date ("2026-02-12"). */
export function dayNumber(isoDate: string): number {
  const time = Date.parse(`${isoDate.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(time)) throw new Error(`Invalid date: ${isoDate}`);
  return Math.round(time / DAY_MS);
}

export function isoDay(day: number): string {
  return new Date(day * DAY_MS).toISOString().slice(0, 10);
}

/** Number of days in an inclusive period. */
export function periodLength(period: Period): number {
  return dayNumber(period.end) - dayNumber(period.start) + 1;
}

/** The period of the same length that ends the day before `period` starts. */
export function previousPeriod(period: Period): Period {
  const length = periodLength(period);
  const start = dayNumber(period.start);
  return { start: isoDay(start - length), end: isoDay(start - 1) };
}

const mean = (values: number[]): number | null =>
  values.length === 0 ? null : values.reduce((sum, v) => sum + v, 0) / values.length;

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Item State on each day of the period: the latest Snapshot on or before the day, carried forward. */
function dailyStates(item: ItemInput, startDay: number, endDay: number): (ItemState | null)[] {
  // Stable sort: for two Snapshots on the same date, the one that comes later in the input wins.
  const snapshots = item.snapshots
    .map((snapshot, index) => ({ snapshot, index, day: dayNumber(snapshot.date) }))
    .sort((a, b) => a.day - b.day || a.index - b.index);
  const override = item.thresholdOverride;

  const states: (ItemState | null)[] = [];
  let pointer = -1; // index of the latest Snapshot on or before the current day
  for (let day = startDay; day <= endDay; day++) {
    while (pointer + 1 < snapshots.length && snapshots[pointer + 1].day <= day) pointer++;
    if (pointer < 0) {
      states.push(null);
      continue;
    }
    const s: SnapshotInput = snapshots[pointer].snapshot;
    states.push({
      snapshotDate: s.date.slice(0, 10),
      currentStock: s.currentStock,
      minRequired: override?.minRequired ?? s.minRequired,
      maxCapacity: override?.maxCapacity ?? s.maxCapacity,
      unitCost: s.unitCost,
      avgUsagePerDay: s.avgUsagePerDay,
      replenishmentTimeDays: s.replenishmentTimeDays,
    });
  }
  return states;
}

/** Mean usage of the last 3 Snapshots on or before `endDay`, over the next 30 days. */
function estimatedDemand(item: ItemInput, endDay: number): number | null {
  const upToEnd = item.snapshots
    .map((snapshot, index) => ({ snapshot, index, day: dayNumber(snapshot.date) }))
    .filter((entry) => entry.day <= endDay)
    .sort((a, b) => a.day - b.day || a.index - b.index);
  const lastThree = upToEnd.slice(-ESTIMATED_DEMAND_SNAPSHOTS).map((entry) => entry.snapshot.avgUsagePerDay);
  const usage = mean(lastThree);
  return usage === null ? null : usage * ESTIMATED_DEMAND_DAYS;
}

/**
 * ABC Class by Stock Value. Items are ranked from highest to lowest value. An Item is A when the
 * cumulative share of value up to and including it is <= the A threshold (80%), B when it is <= the
 * B threshold (95%), otherwise C. Items with equal value form a tie group: they share one class, the
 * one of the cumulative share at the end of the group. The top-ranked group is always A, so a single
 * dominant Item is not demoted to C. With a total value of 0 every Item is C.
 */
export function classifyAbc(
  values: { itemId: number; stockValue: number }[],
  config: Pick<IndicatorConfig, 'abcThresholdA' | 'abcThresholdB'>,
): Map<number, AbcClass> {
  const result = new Map<number, AbcClass>();
  const total = values.reduce((sum, v) => sum + v.stockValue, 0);
  const ranked = [...values].sort((a, b) => b.stockValue - a.stockValue || a.itemId - b.itemId);

  let cumulative = 0;
  let i = 0;
  while (i < ranked.length) {
    let j = i;
    while (j < ranked.length && ranked[j].stockValue === ranked[i].stockValue) j++;
    for (let k = i; k < j; k++) cumulative += ranked[k].stockValue;
    const shareAfter = total > 0 ? (cumulative / total) * 100 : 100;
    // The top-ranked group is always A, even when it alone exceeds the threshold.
    const abcClass: AbcClass =
      i === 0 && total > 0 && ranked[0].stockValue > 0
        ? 'A'
        : shareAfter <= config.abcThresholdA
          ? 'A'
          : shareAfter <= config.abcThresholdB
            ? 'B'
            : 'C';
    for (let k = i; k < j; k++) result.set(ranked[k].itemId, abcClass);
    i = j;
  }
  return result;
}

function emptyIndicators(itemId: number): ItemIndicators {
  return {
    itemId,
    hasState: false,
    state: null,
    stockAutonomyDays: null,
    stockTurnover: null,
    daysOfInventory: null,
    replenishmentTimeDays: null,
    abcClass: null,
    belowMinimum: null,
    minAboveMax: null,
    stockStatus: null,
    urgencyLevel: null,
    priorityScore: null,
    stockValue: null,
    excessStockValue: null,
    lowTurnover: null,
    consumptionTrendPct: null,
    estimatedDemand30d: null,
    annualConsumptionValue: null,
    meanStockValue: null,
  };
}

/**
 * Stock Status, in this order: Below Minimum, Reorder Needed, Excess, Normal.
 * The decision rules (this, Urgency Level, Priority Score) compare autonomy with the Replenishment Time of the
 * Item State on the end date, so they describe "now". The period mean (`ItemIndicators.replenishmentTimeDays`)
 * is an analysis indicator only.
 */
export function stockStatusOf(
  state: ItemState,
  autonomyDays: number | null,
  replenishmentTimeDays: number,
): StockStatus {
  if (state.currentStock < state.minRequired) return 'BELOW_MINIMUM';
  if (autonomyDays !== null && autonomyDays <= replenishmentTimeDays) return 'REORDER_NEEDED';
  if (state.currentStock > state.maxCapacity) return 'EXCESS';
  return 'NORMAL';
}

export function urgencyLevelOf(
  belowMinimum: boolean,
  autonomyDays: number | null,
  replenishmentTimeDays: number,
  abcClass: AbcClass,
  config: Pick<IndicatorConfig, 'urgencyFactor' | 'criticalAbcClasses'>,
): UrgencyLevel {
  if (belowMinimum) return 'CRITICAL';
  if (autonomyDays === null) return 'NORMAL';
  if (autonomyDays <= config.urgencyFactor * replenishmentTimeDays && config.criticalAbcClasses.includes(abcClass)) {
    return 'CRITICAL';
  }
  return autonomyDays <= replenishmentTimeDays ? 'ATTENTION' : 'NORMAL';
}

/** Computes every indicator for `items` over `period`. The Item State at `period.end` is the "current" one. */
export function computeIndicators(
  items: ItemInput[],
  period: Period,
  config: IndicatorConfig,
): IndicatorsResult {
  const startDay = dayNumber(period.start);
  const endDay = dayNumber(period.end);
  if (endDay < startDay) throw new Error(`Invalid period: ${period.start} is after ${period.end}`);
  const length = endDay - startDay + 1;
  const halfIndex = Math.floor(length / 2);

  const series = items.map((item) => dailyStates(item, startDay, endDay));
  const results = items.map((item, index): ItemIndicators => {
    const daily = series[index];
    const state = daily[length - 1];
    if (!state) return emptyIndicators(item.itemId);

    const known = daily.filter((s): s is ItemState => s !== null);
    const meanStock = mean(known.map((s) => s.currentStock))!;
    const meanUsage = mean(known.map((s) => s.avgUsagePerDay))!;
    const replenishmentTime = mean(known.map((s) => s.replenishmentTimeDays))!;
    const meanStockValue = mean(known.map((s) => s.currentStock * s.unitCost))!;
    const annualConsumptionValue = DAYS_PER_YEAR * mean(known.map((s) => s.avgUsagePerDay * s.unitCost))!;

    const turnover = meanStock > 0 ? (meanUsage * DAYS_PER_YEAR) / meanStock : null;
    const firstHalf = mean(daily.slice(0, halfIndex).filter((s): s is ItemState => s !== null).map((s) => s.avgUsagePerDay));
    const secondHalf = mean(daily.slice(halfIndex).filter((s): s is ItemState => s !== null).map((s) => s.avgUsagePerDay));
    const autonomy = state.avgUsagePerDay > 0 ? state.currentStock / state.avgUsagePerDay : null;
    const stockValue = state.currentStock * state.unitCost;
    const belowMinimum = state.currentStock < state.minRequired;

    return {
      ...emptyIndicators(item.itemId),
      hasState: true,
      state,
      stockAutonomyDays: autonomy,
      stockTurnover: turnover,
      daysOfInventory: turnover !== null && turnover > 0 ? DAYS_PER_YEAR / turnover : null,
      replenishmentTimeDays: replenishmentTime,
      belowMinimum,
      minAboveMax: state.minRequired > state.maxCapacity,
      stockStatus: stockStatusOf(state, autonomy, state.replenishmentTimeDays),
      stockValue,
      excessStockValue: Math.max(0, state.currentStock - state.maxCapacity) * state.unitCost,
      lowTurnover: turnover !== null && turnover < config.lowTurnoverThreshold,
      consumptionTrendPct:
        firstHalf !== null && secondHalf !== null && firstHalf > 0 ? ((secondHalf - firstHalf) / firstHalf) * 100 : null,
      estimatedDemand30d: estimatedDemand(item, endDay),
      annualConsumptionValue,
      meanStockValue,
    };
  });

  // ABC Class needs every Item's Stock Value, so it is assigned after the per-Item pass.
  const withState = results.filter((r) => r.hasState);
  const abc = classifyAbc(
    withState.map((r) => ({ itemId: r.itemId, stockValue: r.stockValue! })),
    config,
  );
  for (const r of withState) {
    r.abcClass = abc.get(r.itemId)!;
    r.urgencyLevel = urgencyLevelOf(r.belowMinimum!, r.stockAutonomyDays, r.state!.replenishmentTimeDays, r.abcClass, config);
    r.priorityScore =
      r.stockAutonomyDays === null
        ? 0
        : Math.max(0, r.state!.replenishmentTimeDays - r.stockAutonomyDays) * r.state!.avgUsagePerDay * r.state!.unitCost;
  }

  return {
    period,
    items: results,
    portfolio: portfolioOf(withState),
    availabilitySeries: availabilitySeries(series, startDay),
  };
}

function availabilitySeries(series: (ItemState | null)[][], startDay: number): AvailabilityPoint[] {
  const length = series[0]?.length ?? 0;
  const points: AvailabilityPoint[] = [];
  for (let d = 0; d < length; d++) {
    const states = series.map((s) => s[d]).filter((s): s is ItemState => s !== null);
    points.push({
      date: isoDay(startDay + d),
      availabilityPct:
        states.length === 0 ? null : (states.filter((s) => s.currentStock >= s.minRequired).length / states.length) * 100,
      itemsWithState: states.length,
    });
  }
  return points;
}

function portfolioOf(withState: ItemIndicators[]): PortfolioIndicators {
  const sumMeanStockValue = withState.reduce((sum, r) => sum + r.meanStockValue!, 0);
  const sumConsumption = withState.reduce((sum, r) => sum + r.annualConsumptionValue!, 0);
  const portfolio: PortfolioIndicators = {
    itemsWithState: withState.length,
    medianAutonomyDays: median(withState.map((r) => r.stockAutonomyDays).filter((v): v is number => v !== null)),
    weightedTurnover: sumMeanStockValue > 0 ? sumConsumption / sumMeanStockValue : null,
    meanReplenishmentTimeDays: mean(withState.map((r) => r.replenishmentTimeDays!)),
    stockValue: withState.reduce((sum, r) => sum + r.stockValue!, 0),
    excessStockValue: withState.reduce((sum, r) => sum + r.excessStockValue!, 0),
    belowMinimumCount: withState.filter((r) => r.belowMinimum).length,
    lowTurnoverCount: withState.filter((r) => r.lowTurnover).length,
    inventoryAvailabilityPct:
      withState.length === 0 ? null : (withState.filter((r) => !r.belowMinimum).length / withState.length) * 100,
    urgencyCounts: { CRITICAL: 0, ATTENTION: 0, NORMAL: 0 },
    abcCounts: { A: 0, B: 0, C: 0 },
    stockStatusCounts: { BELOW_MINIMUM: 0, REORDER_NEEDED: 0, EXCESS: 0, NORMAL: 0 },
  };
  for (const r of withState) {
    portfolio.urgencyCounts[r.urgencyLevel!]++;
    portfolio.abcCounts[r.abcClass!]++;
    portfolio.stockStatusCounts[r.stockStatus!]++;
  }
  return portfolio;
}
