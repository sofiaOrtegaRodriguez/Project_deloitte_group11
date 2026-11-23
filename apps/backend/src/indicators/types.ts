// Types of the pure indicators module. No I/O here: the caller loads the data and passes it in.
// Dates are ISO calendar days ("2026-02-12"), numbers are plain JS numbers.

export type AbcClass = 'A' | 'B' | 'C';
export type StockStatus = 'BELOW_MINIMUM' | 'REORDER_NEEDED' | 'EXCESS' | 'NORMAL';
export type UrgencyLevel = 'CRITICAL' | 'ATTENTION' | 'NORMAL';

/** One dated record of an Item (a Snapshot). */
export interface SnapshotInput {
  date: string;
  currentStock: number;
  minRequired: number;
  maxCapacity: number;
  unitCost: number;
  avgUsagePerDay: number;
  replenishmentTimeDays: number;
}

/** Director-set thresholds. A null side means "no override: use the Snapshot's value". */
export interface ThresholdOverrideInput {
  minRequired: number | null;
  maxCapacity: number | null;
}

export interface ItemInput {
  itemId: number;
  snapshots: SnapshotInput[];
  thresholdOverride?: ThresholdOverrideInput | null;
}

export interface IndicatorConfig {
  /** Cumulative share of Stock Value (in %) covered by class A. Default 80. */
  abcThresholdA: number;
  /** Cumulative share of Stock Value (in %) covered by classes A and B together. Default 95. */
  abcThresholdB: number;
  /** An Item is Critical when autonomy <= factor x Replenishment Time and its ABC Class is in the set. */
  urgencyFactor: number;
  criticalAbcClasses: AbcClass[];
  /** Stock Turnover (per year) below this makes an Item a Low-Turnover Item. */
  lowTurnoverThreshold: number;
}

export const DEFAULT_INDICATOR_CONFIG: IndicatorConfig = {
  abcThresholdA: 80,
  abcThresholdB: 95,
  urgencyFactor: 0.5,
  criticalAbcClasses: ['A', 'B'],
  lowTurnoverThreshold: 12,
};

/** An inclusive range of days. The Reference Date is normally `end`. */
export interface Period {
  start: string;
  end: string;
}

/** The Item State on one day: the latest Snapshot on or before it, with Threshold Overrides applied. */
export interface ItemState {
  /** Date of the Snapshot the state comes from (carried forward). */
  snapshotDate: string;
  currentStock: number;
  /** Effective minimum: the Threshold Override when present, else the Snapshot's value. */
  minRequired: number;
  /** Effective maximum: the Threshold Override when present, else the Snapshot's value. */
  maxCapacity: number;
  unitCost: number;
  avgUsagePerDay: number;
  replenishmentTimeDays: number;
}

export interface ItemIndicators {
  itemId: number;
  /** False when the Item has no Snapshot on or before the end of the period: every other field is null. */
  hasState: boolean;
  state: ItemState | null;
  /** Days the current stock lasts. Null when the usage rate is 0 (it never runs out). */
  stockAutonomyDays: number | null;
  /** Times per year. Null when the mean stock is 0. */
  stockTurnover: number | null;
  /** 365 / turnover. Null when turnover is null or 0. */
  daysOfInventory: number | null;
  /** Mean Replenishment Time over the period (carried-forward daily series). */
  replenishmentTimeDays: number | null;
  abcClass: AbcClass | null;
  belowMinimum: boolean | null;
  /** True when the effective minimum is above the effective maximum. */
  minAboveMax: boolean | null;
  stockStatus: StockStatus | null;
  urgencyLevel: UrgencyLevel | null;
  priorityScore: number | null;
  stockValue: number | null;
  excessStockValue: number | null;
  lowTurnover: boolean | null;
  /** % change in mean usage between the first and the second half of the period. */
  consumptionTrendPct: number | null;
  /** Mean usage of the last 3 Snapshots x 30. */
  estimatedDemand30d: number | null;
  /** 365 x mean daily (usage x unit cost) over the period. Used by the portfolio turnover. */
  annualConsumptionValue: number | null;
  /** Mean daily Stock Value over the period. Used by the portfolio turnover. */
  meanStockValue: number | null;
}

export interface AvailabilityPoint {
  date: string;
  /** % of Items with a state that day whose stock is at or above their minimum. Null when no Item has a state. */
  availabilityPct: number | null;
  itemsWithState: number;
}

export interface ValuePoint {
  date: string;
  /** Σ stock x unit cost of the Items with a state that day. 0 when none. */
  stockValue: number;
  /** Σ avg usage per day x unit cost of the Items with a state that day: the value consumed that day. 0 when none. */
  consumptionValue: number;
}

/** Per-day portfolio indicators, from the carried-forward Item State of the Items with a state that day. */
export interface DailyIndicatorPoint {
  date: string;
  stockValue: number;
  excessStockValue: number;
  /** Items whose stock is below their minimum that day. */
  belowMinimumCount: number;
  /** Median of stock / usage over the Items that consume stock that day. Null when none. */
  medianAutonomyDays: number | null;
  /** Point-in-time turnover: 365 x sum(usage x cost) / sum(stock x cost) that day. Null when the Stock Value is 0. */
  stockTurnover: number | null;
  /** Mean Replenishment Time of the Items with a state that day. Null when none. */
  replenishmentTimeDays: number | null;
}

export interface PortfolioIndicators {
  itemsWithState: number;
  /** Median Stock Autonomy of the Items that consume stock. Null when there are none. */
  medianAutonomyDays: number | null;
  /** Σ annual consumption value / Σ mean Stock Value. Null when the mean Stock Value is 0. */
  weightedTurnover: number | null;
  /** Mean of the per-Item mean Replenishment Times. */
  meanReplenishmentTimeDays: number | null;
  stockValue: number;
  excessStockValue: number;
  belowMinimumCount: number;
  lowTurnoverCount: number;
  /** % of Items with stock at or above their minimum on the end date. */
  inventoryAvailabilityPct: number | null;
  urgencyCounts: Record<UrgencyLevel, number>;
  abcCounts: Record<AbcClass, number>;
  stockStatusCounts: Record<StockStatus, number>;
}

export interface IndicatorsResult {
  period: Period;
  items: ItemIndicators[];
  portfolio: PortfolioIndicators;
  availabilitySeries: AvailabilityPoint[];
  /** Daily total Stock Value and consumption value, from the carried-forward Item State. */
  valueSeries: ValuePoint[];
  /** Daily series of the remaining indicators (excess, below minimum, autonomy, turnover, Replenishment Time). */
  dailySeries: DailyIndicatorPoint[];
}
