// Seam B: the pure indicators module, with hand-computed numbers. No database.
//
// Main scenario, period 2025-01-01 .. 2025-01-10 (10 days). Every expected value below is worked out by hand.
//
//  SNAP  snapshots: 01-01 stock 100 min 20 max 200 cost 10 usage 5  RT 4
//                   01-06 stock  60 min 20 max 200 cost 10 usage 10 RT 8
//        days 1-5 use the first Snapshot, days 6-10 the second (carried forward).
//        mean stock = (5x100 + 5x60) / 10 = 80;  mean usage = (5x5 + 5x10) / 10 = 7.5
//        turnover = 7.5 x 365 / 80 = 34.21875;  days of inventory = 365 / 34.21875 = 80 / 7.5 = 10.667
//        mean RT = (5x4 + 5x8) / 10 = 6;  autonomy on 01-10 = 60 / 10 = 6 <= RT 8 -> Reorder Needed
//        Critical needs autonomy <= 0.5 x 8 = 4: no -> Attention.  priority = (8 - 6) x 10 x 10 = 200
//        trend = (10 - 5) / 5 = +100%;  estimated demand = mean(5, 10) x 30 = 225;  stock value 600
//        annual consumption value = 365 x mean(usage x cost) = 365 x 75 = 27375;  mean stock value = 800
//  BIG   one Snapshot 01-01: stock 1000 min 100 max 800 cost 20 usage 50 RT 10
//        autonomy 20 > RT 10; stock > max -> Excess; stock value 20000; excess (1000 - 800) x 20 = 4000
//        turnover = 50 x 365 / 1000 = 18.25;  days of inventory 20;  trend 0%;  demand 1500
//        annual consumption 365 x 1000 = 365000;  mean stock value 20000
//  LATE  first Snapshot 01-04: stock 30 min 40 max 100 cost 5 usage 3 RT 2 (no state on days 1-3)
//        below minimum -> Below Minimum, Critical;  autonomy 10;  priority max(0, 2 - 10) = 0
//        7 known days: turnover = 3 x 365 / 30 = 36.5;  annual consumption 365 x 15 = 5475;  mean stock value 150
//  IDLE  one Snapshot 01-01: stock 50 min 10 max 100 cost 2 usage 0 RT 5
//        usage 0 -> autonomy null (never runs out), turnover 0, days of inventory null, Low-Turnover;
//        Normal;  stock value 100
//  GHOST first Snapshot 2025-02-01, after the period: no state, every indicator null.
import {
  classifyAbc,
  computeIndicators,
  dayNumber,
  isoDay,
  periodLength,
  previousPeriod,
  stockStatusOf,
  urgencyLevelOf,
} from './indicators';
import {
  DEFAULT_INDICATOR_CONFIG,
  type IndicatorConfig,
  type ItemInput,
  type ItemState,
  type SnapshotInput,
  type ThresholdOverrideInput,
} from './types';

const snap = (
  date: string,
  currentStock: number,
  minRequired: number,
  maxCapacity: number,
  unitCost: number,
  avgUsagePerDay: number,
  replenishmentTimeDays: number,
): SnapshotInput => ({ date, currentStock, minRequired, maxCapacity, unitCost, avgUsagePerDay, replenishmentTimeDays });

const item = (itemId: number, snapshots: SnapshotInput[], thresholdOverride?: ThresholdOverrideInput): ItemInput => ({
  itemId,
  snapshots,
  thresholdOverride,
});

const SNAP = 1;
const BIG = 2;
const LATE = 3;
const IDLE = 4;
const GHOST = 5;

const mainItems = (overrides: { [id: number]: ThresholdOverrideInput } = {}): ItemInput[] => [
  item(SNAP, [snap('2025-01-06', 60, 20, 200, 10, 10, 8), snap('2025-01-01', 100, 20, 200, 10, 5, 4)], overrides[SNAP]),
  item(BIG, [snap('2025-01-01', 1000, 100, 800, 20, 50, 10)], overrides[BIG]),
  item(LATE, [snap('2025-01-04', 30, 40, 100, 5, 3, 2)], overrides[LATE]),
  item(IDLE, [snap('2025-01-01', 50, 10, 100, 2, 0, 5)], overrides[IDLE]),
  item(GHOST, [snap('2025-02-01', 10, 1, 20, 1, 1, 1)], overrides[GHOST]),
];

const PERIOD = { start: '2025-01-01', end: '2025-01-10' };
const compute = (items: ItemInput[], period = PERIOD, config: IndicatorConfig = DEFAULT_INDICATOR_CONFIG) =>
  computeIndicators(items, period, config);
const byId = (result: ReturnType<typeof compute>, id: number) => result.items.find((i) => i.itemId === id)!;

describe('dates and periods', () => {
  it('counts inclusive days and converts back to ISO dates', () => {
    expect(periodLength(PERIOD)).toBe(10);
    expect(isoDay(dayNumber('2025-03-01'))).toBe('2025-03-01');
    expect(dayNumber('2025-03-01') - dayNumber('2025-02-28')).toBe(1);
  });

  it('gives the previous period of the same length, ending the day before', () => {
    expect(previousPeriod(PERIOD)).toEqual({ start: '2024-12-22', end: '2024-12-31' });
    expect(previousPeriod({ start: '2025-01-06', end: '2025-01-10' })).toEqual({ start: '2025-01-01', end: '2025-01-05' });
  });
});

describe('per-Item indicators', () => {
  const result = compute(mainItems());

  it('Item with two Snapshots: autonomy, turnover, Replenishment Time, trend, demand, values', () => {
    const r = byId(result, SNAP);
    expect(r.hasState).toBe(true);
    expect(r.state).toMatchObject({ snapshotDate: '2025-01-06', currentStock: 60, minRequired: 20, maxCapacity: 200 });
    expect(r.stockAutonomyDays).toBeCloseTo(6, 10);
    expect(r.stockTurnover).toBeCloseTo(34.21875, 10);
    expect(r.daysOfInventory).toBeCloseTo(10.6667, 4);
    expect(r.replenishmentTimeDays).toBeCloseTo(6, 10);
    expect(r.consumptionTrendPct).toBeCloseTo(100, 10);
    expect(r.estimatedDemand30d).toBeCloseTo(225, 10);
    expect(r.stockValue).toBe(600);
    expect(r.excessStockValue).toBe(0);
    expect(r.annualConsumptionValue).toBeCloseTo(27375, 6);
    expect(r.meanStockValue).toBeCloseTo(800, 10);
    expect(r.belowMinimum).toBe(false);
    expect(r.lowTurnover).toBe(false);
  });

  it('Stock Status uses Below Minimum, then Reorder Needed, then Excess, then Normal', () => {
    expect(byId(result, SNAP).stockStatus).toBe('REORDER_NEEDED'); // autonomy 6 <= Replenishment Time 8
    expect(byId(result, BIG).stockStatus).toBe('EXCESS'); // autonomy 20 > 10, stock 1000 > max 800
    expect(byId(result, LATE).stockStatus).toBe('BELOW_MINIMUM'); // 30 < 40
    expect(byId(result, IDLE).stockStatus).toBe('NORMAL');
  });

  it('Urgency Level and Priority Score', () => {
    expect(byId(result, SNAP).urgencyLevel).toBe('ATTENTION'); // 6 > 0.5 x 8 = 4
    expect(byId(result, SNAP).priorityScore).toBeCloseTo(200, 10);
    expect(byId(result, BIG).urgencyLevel).toBe('NORMAL');
    expect(byId(result, BIG).priorityScore).toBe(0);
    expect(byId(result, LATE).urgencyLevel).toBe('CRITICAL'); // below minimum
    expect(byId(result, LATE).priorityScore).toBe(0); // max(0, 2 - 10) = 0
    expect(byId(result, IDLE).urgencyLevel).toBe('NORMAL');
  });

  it('Excess Stock is the stock above Max Capacity at unit cost', () => {
    expect(byId(result, BIG).excessStockValue).toBe(4000);
    expect(byId(result, BIG).stockValue).toBe(20000);
    expect(byId(result, BIG).stockTurnover).toBeCloseTo(18.25, 10);
    expect(byId(result, BIG).daysOfInventory).toBeCloseTo(20, 10);
    expect(byId(result, BIG).consumptionTrendPct).toBe(0);
    expect(byId(result, BIG).estimatedDemand30d).toBe(1500);
  });

  it('an Item that appears mid-period only averages over the days it has a state', () => {
    const r = byId(result, LATE);
    expect(r.stockAutonomyDays).toBeCloseTo(10, 10);
    expect(r.stockTurnover).toBeCloseTo(36.5, 10);
    expect(r.annualConsumptionValue).toBeCloseTo(5475, 6);
    expect(r.meanStockValue).toBeCloseTo(150, 10);
    expect(r.consumptionTrendPct).toBe(0); // usage 3 in both halves
    expect(r.belowMinimum).toBe(true);
  });

  it('an Item with zero usage never runs out: no autonomy, turnover 0, Low-Turnover', () => {
    const r = byId(result, IDLE);
    expect(r.stockAutonomyDays).toBeNull();
    expect(r.stockTurnover).toBe(0);
    expect(r.daysOfInventory).toBeNull();
    expect(r.lowTurnover).toBe(true);
    expect(r.priorityScore).toBe(0);
    expect(r.consumptionTrendPct).toBeNull(); // first half usage is 0: no percentage
    expect(r.stockValue).toBe(100);
  });

  it('an Item whose first Snapshot is after the period has no state and null indicators', () => {
    const r = byId(result, GHOST);
    expect(r.hasState).toBe(false);
    expect(r.state).toBeNull();
    expect(r.stockAutonomyDays).toBeNull();
    expect(r.stockValue).toBeNull();
    expect(r.stockStatus).toBeNull();
    expect(r.urgencyLevel).toBeNull();
    expect(r.abcClass).toBeNull();
  });

  it('two Snapshots on the same date: the later one in the input wins', () => {
    const r = byId(
      compute([item(1, [snap('2025-01-01', 10, 1, 50, 1, 1, 1), snap('2025-01-01', 20, 1, 50, 1, 1, 1)])]),
      1,
    );
    expect(r.state?.currentStock).toBe(20);
  });
});

describe('portfolio aggregates', () => {
  const { portfolio } = compute(mainItems());

  it('counts only Items with a state', () => {
    expect(portfolio.itemsWithState).toBe(4);
  });

  it('median autonomy ignores Items that never run out: median(6, 10, 20) = 10', () => {
    expect(portfolio.medianAutonomyDays).toBeCloseTo(10, 10);
  });

  it('median of an even count is the mean of the two middle values', () => {
    const items = [
      item(1, [snap('2025-01-01', 10, 0, 100, 1, 1, 1)]), // autonomy 10
      item(2, [snap('2025-01-01', 30, 0, 100, 1, 1, 1)]), // autonomy 30
    ];
    expect(compute(items).portfolio.medianAutonomyDays).toBeCloseTo(20, 10);
  });

  it('turnover is value-weighted: (27375 + 365000 + 5475 + 0) / (800 + 20000 + 150 + 100)', () => {
    expect(portfolio.weightedTurnover).toBeCloseTo(397850 / 21050, 6); // 18.9002
  });

  it('Replenishment Time is the mean of the per-Item means: (6 + 10 + 2 + 5) / 4', () => {
    expect(portfolio.meanReplenishmentTimeDays).toBeCloseTo(5.75, 10);
  });

  it('totals, counts and Inventory Availability', () => {
    expect(portfolio.stockValue).toBe(20850); // 600 + 20000 + 150 + 100
    expect(portfolio.excessStockValue).toBe(4000);
    expect(portfolio.belowMinimumCount).toBe(1);
    expect(portfolio.lowTurnoverCount).toBe(1);
    expect(portfolio.inventoryAvailabilityPct).toBeCloseTo(75, 10); // 3 of 4 at or above minimum
    expect(portfolio.urgencyCounts).toEqual({ CRITICAL: 1, ATTENTION: 1, NORMAL: 2 });
    expect(portfolio.stockStatusCounts).toEqual({ BELOW_MINIMUM: 1, REORDER_NEEDED: 1, EXCESS: 1, NORMAL: 1 });
    // BIG holds 20000 of 20850 (95.9%): the top group is always A. The rest reach 100%: C.
    expect(portfolio.abcCounts).toEqual({ A: 1, B: 0, C: 3 });
  });

  it('Inventory Availability as a daily series', () => {
    const { availabilitySeries } = compute(mainItems());
    expect(availabilitySeries).toHaveLength(10);
    // Days 1-3: SNAP, BIG, IDLE have a state and all are at or above minimum.
    expect(availabilitySeries[0]).toEqual({ date: '2025-01-01', availabilityPct: 100, itemsWithState: 3 });
    expect(availabilitySeries[2]).toEqual({ date: '2025-01-03', availabilityPct: 100, itemsWithState: 3 });
    // From day 4 LATE joins, below its minimum: 3 of 4.
    expect(availabilitySeries[3]).toEqual({ date: '2025-01-04', availabilityPct: 75, itemsWithState: 4 });
    expect(availabilitySeries[9]).toEqual({ date: '2025-01-10', availabilityPct: 75, itemsWithState: 4 });
  });

  it('Stock Value and consumption as daily series from the carried-forward state', () => {
    const { valueSeries } = compute(mainItems());
    expect(valueSeries).toHaveLength(10);
    // Day 1: SNAP 100x10 + BIG 1000x20 + IDLE 50x2 = 21100; usage 5x10 + 50x20 + 0 = 1050.
    expect(valueSeries[0]).toEqual({ date: '2025-01-01', stockValue: 21100, consumptionValue: 1050 });
    // Day 4: LATE joins: + 30x5 = 150 stock, + 3x5 = 15 usage.
    expect(valueSeries[3]).toEqual({ date: '2025-01-04', stockValue: 21250, consumptionValue: 1065 });
    // Day 6: SNAP second Snapshot: 60x10 = 600 stock, 10x10 = 100 usage.
    expect(valueSeries[5]).toEqual({ date: '2025-01-06', stockValue: 20850, consumptionValue: 1115 });
    expect(valueSeries[9].stockValue).toBe(20850);
  });

  it('the value series covers only the kept slice and is 0 when no Item has a state', () => {
    const slice = computeIndicators(mainItems(), PERIOD, DEFAULT_INDICATOR_CONFIG, (i) => i.itemId === SNAP);
    expect(slice.valueSeries[0]).toEqual({ date: '2025-01-01', stockValue: 1000, consumptionValue: 50 });
    expect(slice.valueSeries[9]).toEqual({ date: '2025-01-10', stockValue: 600, consumptionValue: 100 });
    const ghost = compute([item(GHOST, [snap('2025-02-01', 10, 1, 20, 1, 1, 1)])]);
    expect(ghost.valueSeries[0]).toEqual({ date: '2025-01-01', stockValue: 0, consumptionValue: 0 });
  });

  it('an empty portfolio has null aggregates', () => {
    const { portfolio: empty } = compute([item(GHOST, [snap('2025-02-01', 10, 1, 20, 1, 1, 1)])]);
    expect(empty.itemsWithState).toBe(0);
    expect(empty.medianAutonomyDays).toBeNull();
    expect(empty.weightedTurnover).toBeNull();
    expect(empty.meanReplenishmentTimeDays).toBeNull();
    expect(empty.inventoryAvailabilityPct).toBeNull();
    expect(empty.stockValue).toBe(0);
  });
});

describe('periods: previous period and a period with no Snapshots', () => {
  it('the previous period of the same length uses the state at its own end', () => {
    const current = { start: '2025-01-06', end: '2025-01-10' };
    const now = byId(compute(mainItems(), current), SNAP);
    const before = byId(compute(mainItems(), previousPeriod(current)), SNAP);
    // 01-06..01-10: stock 60, usage 10 -> autonomy 6, turnover 10 x 365 / 60 = 60.833
    expect(now.stockAutonomyDays).toBeCloseTo(6, 10);
    expect(now.stockTurnover).toBeCloseTo(60.8333, 4);
    // 01-01..01-05: stock 100, usage 5 -> autonomy 20, turnover 5 x 365 / 100 = 18.25
    expect(before.stockAutonomyDays).toBeCloseTo(20, 10);
    expect(before.stockTurnover).toBeCloseTo(18.25, 10);
    expect(before.replenishmentTimeDays).toBeCloseTo(4, 10);
  });

  it('a period with no Snapshots uses the carried-forward state', () => {
    // 01-08..01-10 contains no Snapshot date: SNAP carries 01-06 forward (stock 60, usage 10, RT 8).
    const r = byId(compute(mainItems(), { start: '2025-01-08', end: '2025-01-10' }), SNAP);
    expect(r.hasState).toBe(true);
    expect(r.state?.snapshotDate).toBe('2025-01-06');
    expect(r.stockAutonomyDays).toBeCloseTo(6, 10);
    expect(r.stockTurnover).toBeCloseTo(60.8333, 4); // 10 x 365 / 60
    expect(r.replenishmentTimeDays).toBeCloseTo(8, 10);
    expect(r.consumptionTrendPct).toBe(0);
    expect(r.estimatedDemand30d).toBeCloseTo(225, 10); // last 2 Snapshots: mean(5, 10) x 30
  });

  it('a period entirely before an Item has any Snapshot gives no state', () => {
    const r = byId(compute(mainItems(), { start: '2024-12-01', end: '2024-12-31' }), SNAP);
    expect(r.hasState).toBe(false);
  });

  it('rejects a period that ends before it starts', () => {
    expect(() => compute(mainItems(), { start: '2025-01-10', end: '2025-01-01' })).toThrow('Invalid period');
  });

  it('a falling consumption trend is negative: usage 10 then 5 is -50%', () => {
    const r = byId(
      compute([item(1, [snap('2025-01-01', 100, 0, 500, 1, 10, 1), snap('2025-01-06', 100, 0, 500, 1, 5, 1)])]),
      1,
    );
    expect(r.consumptionTrendPct).toBeCloseTo(-50, 10);
  });

  it('Estimated Demand uses the last 3 Snapshots: mean(2, 3, 6) x 30 = 110', () => {
    const r = byId(
      compute([
        item(1, [
          snap('2025-01-01', 100, 0, 500, 1, 1, 1),
          snap('2025-01-02', 100, 0, 500, 1, 2, 1),
          snap('2025-01-03', 100, 0, 500, 1, 3, 1),
          snap('2025-01-04', 100, 0, 500, 1, 6, 1),
        ]),
      ]),
      1,
    );
    expect(r.estimatedDemand30d).toBeCloseTo(110, 10);
  });

  it('Estimated Demand ignores Snapshots after the period end', () => {
    const r = byId(
      compute([item(1, [snap('2025-01-01', 100, 0, 500, 1, 4, 1), snap('2025-03-01', 100, 0, 500, 1, 100, 1)])]),
      1,
    );
    expect(r.estimatedDemand30d).toBeCloseTo(120, 10); // 4 x 30
  });
});

describe('Threshold Overrides', () => {
  it('an override of the minimum takes priority over the Snapshot: min 70 > stock 60 -> Below Minimum, Critical', () => {
    const r = byId(compute(mainItems({ [SNAP]: { minRequired: 70, maxCapacity: null } })), SNAP);
    expect(r.state).toMatchObject({ minRequired: 70, maxCapacity: 200 }); // maximum untouched
    expect(r.belowMinimum).toBe(true);
    expect(r.stockStatus).toBe('BELOW_MINIMUM');
    expect(r.urgencyLevel).toBe('CRITICAL');
  });

  it('an override of the maximum changes Excess Stock: (1000 - 50) x 20 = 19000', () => {
    const result = compute(mainItems({ [BIG]: { minRequired: null, maxCapacity: 50 } }));
    expect(byId(result, BIG).excessStockValue).toBe(19000);
    expect(byId(result, BIG).state).toMatchObject({ minRequired: 100, maxCapacity: 50 });
    expect(result.portfolio.excessStockValue).toBe(19000);
  });

  it('an override that removes a Below Minimum condition: min 10 < stock 30', () => {
    const result = compute(mainItems({ [LATE]: { minRequired: 10, maxCapacity: null } }));
    expect(byId(result, LATE).belowMinimum).toBe(false);
    expect(byId(result, LATE).stockStatus).toBe('NORMAL'); // autonomy 10 > RT 2, stock 30 <= max 100
    expect(result.portfolio.belowMinimumCount).toBe(0);
    expect(result.portfolio.inventoryAvailabilityPct).toBeCloseTo(100, 10);
  });

  it('an override with both sides null changes nothing', () => {
    const plain = compute(mainItems());
    const nulls = compute(mainItems({ [SNAP]: { minRequired: null, maxCapacity: null } }));
    expect(byId(nulls, SNAP)).toEqual(byId(plain, SNAP));
  });

  it('an override applies to the whole daily series, not only the end date', () => {
    // SNAP stock is 100 on days 1-5 and 60 on days 6-10. Minimum 70: below on days 6-10 only.
    const { availabilitySeries } = compute(mainItems({ [SNAP]: { minRequired: 70, maxCapacity: null } }));
    expect(availabilitySeries[0].availabilityPct).toBeCloseTo(100, 10); // 3 of 3
    expect(availabilitySeries[5].availabilityPct).toBeCloseTo(50, 10); // LATE and SNAP below: 2 of 4
  });
});

describe('minimum above maximum', () => {
  it('is flagged, and Below Minimum still wins over Excess', () => {
    // Stock 28, min 30, max 25: both "below minimum" and "above maximum".
    const r = byId(compute([item(1, [snap('2025-01-01', 28, 30, 25, 2, 1, 5)])]), 1);
    expect(r.minAboveMax).toBe(true);
    expect(r.belowMinimum).toBe(true);
    expect(r.stockStatus).toBe('BELOW_MINIMUM');
    expect(r.excessStockValue).toBe(6); // (28 - 25) x 2
  });

  it('stock under both thresholds has no Excess Stock', () => {
    const r = byId(compute([item(1, [snap('2025-01-01', 10, 30, 25, 2, 1, 5)])]), 1);
    expect(r.minAboveMax).toBe(true);
    expect(r.stockStatus).toBe('BELOW_MINIMUM');
    expect(r.excessStockValue).toBe(0);
  });

  it('with sane thresholds the flag is false', () => {
    expect(byId(compute(mainItems()), SNAP).minAboveMax).toBe(false);
  });
});

describe('extreme autonomy values', () => {
  it('a huge stock with tiny usage: autonomy 1e9 days, Normal, huge days of inventory', () => {
    const r = byId(compute([item(1, [snap('2025-01-01', 1_000_000, 0, 2_000_000, 1, 0.001, 3)])]), 1);
    expect(r.stockAutonomyDays).toBeCloseTo(1e9, 0);
    expect(r.stockStatus).toBe('NORMAL');
    expect(r.urgencyLevel).toBe('NORMAL');
    expect(r.stockTurnover).toBeCloseTo(3.65e-7, 12); // 0.001 x 365 / 1e6
    expect(r.lowTurnover).toBe(true);
  });

  it('stock 5 with usage 1000: autonomy 0.005 days, Reorder Needed, Critical for a class A Item', () => {
    const r = byId(compute([item(1, [snap('2025-01-01', 5, 0, 100, 1, 1000, 3)])]), 1);
    expect(r.stockAutonomyDays).toBeCloseTo(0.005, 10);
    expect(r.abcClass).toBe('A'); // a single Item is always A
    expect(r.stockStatus).toBe('REORDER_NEEDED');
    expect(r.urgencyLevel).toBe('CRITICAL'); // 0.005 <= 0.5 x 3 and class A
  });

  it('zero stock: autonomy 0, not below a minimum of 0, priority = RT x usage x cost = 5 x 4 x 3 = 60', () => {
    const r = byId(compute([item(1, [snap('2025-01-01', 0, 0, 100, 3, 4, 5)])]), 1);
    expect(r.stockAutonomyDays).toBe(0);
    expect(r.belowMinimum).toBe(false);
    expect(r.stockStatus).toBe('REORDER_NEEDED');
    expect(r.priorityScore).toBeCloseTo(60, 10);
    expect(r.stockValue).toBe(0);
    expect(r.stockTurnover).toBeNull(); // mean stock 0
    expect(r.lowTurnover).toBe(false);
  });
});

describe('stockStatusOf and urgencyLevelOf', () => {
  const state = (over: Partial<ItemState>): ItemState => ({
    snapshotDate: '2025-01-01',
    currentStock: 100,
    minRequired: 10,
    maxCapacity: 500,
    unitCost: 1,
    avgUsagePerDay: 10,
    replenishmentTimeDays: 5,
    ...over,
  });

  it('applies the status order Below Minimum -> Reorder Needed -> Excess -> Normal', () => {
    expect(stockStatusOf(state({ currentStock: 5 }), 0.5, 5)).toBe('BELOW_MINIMUM');
    expect(stockStatusOf(state({ currentStock: 600 }), 4, 5)).toBe('REORDER_NEEDED'); // also above max
    expect(stockStatusOf(state({ currentStock: 600 }), 60, 5)).toBe('EXCESS');
    expect(stockStatusOf(state({}), 10, 5)).toBe('NORMAL');
    expect(stockStatusOf(state({}), 5, 5)).toBe('REORDER_NEEDED'); // autonomy equal to Replenishment Time counts
    expect(stockStatusOf(state({ avgUsagePerDay: 0 }), null, 5)).toBe('NORMAL');
  });

  const urgency = (
    below: boolean,
    autonomy: number | null,
    abc: 'A' | 'B' | 'C',
    config: Partial<IndicatorConfig> = {},
  ) => urgencyLevelOf(below, autonomy, 10, abc, { ...DEFAULT_INDICATOR_CONFIG, ...config });

  it('Critical: below minimum, or autonomy <= factor x RT for class A or B (default factor 1/2)', () => {
    expect(urgency(true, 100, 'C')).toBe('CRITICAL');
    expect(urgency(false, 5, 'A')).toBe('CRITICAL'); // 5 <= 0.5 x 10, boundary included
    expect(urgency(false, 5, 'B')).toBe('CRITICAL');
    expect(urgency(false, 5, 'C')).toBe('ATTENTION'); // class C does not count
    expect(urgency(false, 5.01, 'A')).toBe('ATTENTION');
  });

  it('Attention: autonomy <= Replenishment Time; Normal otherwise', () => {
    expect(urgency(false, 10, 'A')).toBe('ATTENTION');
    expect(urgency(false, 10.01, 'A')).toBe('NORMAL');
    expect(urgency(false, null, 'A')).toBe('NORMAL');
  });

  it('follows the configured factor and classes', () => {
    expect(urgency(false, 8, 'A', { urgencyFactor: 1 })).toBe('CRITICAL');
    expect(urgency(false, 5, 'A', { criticalAbcClasses: ['B'] })).toBe('ATTENTION');
    expect(urgency(false, 5, 'C', { criticalAbcClasses: ['A', 'B', 'C'] })).toBe('CRITICAL');
  });
});

describe('daily indicator series', () => {
  const current = { start: '2025-01-06', end: '2025-01-10' };

  it('computes every per-day indicator from the carried-forward states', () => {
    // 01-06: Syringe (60, min 20, max 200, cost 10, usage 10, RT 8), Ventilator (1000, 100, 800, 20, 50, 10),
    //        Monitor (30, 40, 100, 5, 3, 2), Gauze (50, 10, 100, 2, 0, 5). The 02-01 Item has no state yet.
    const point = compute(mainItems(), current).dailySeries[0];
    expect(point.date).toBe('2025-01-06');
    expect(point.stockValue).toBe(20850); // 600 + 20000 + 150 + 100
    expect(point.excessStockValue).toBe(4000); // Ventilator: (1000 - 800) x 20
    expect(point.belowMinimumCount).toBe(1); // Monitor 30 < 40
    expect(point.medianAutonomyDays).toBeCloseTo(10, 10); // autonomies 6, 20, 10 (Gauze consumes nothing)
    expect(point.stockTurnover).toBeCloseTo((1115 * 365) / 20850, 10); // consumption 100 + 1000 + 15 + 0
    expect(point.replenishmentTimeDays).toBeCloseTo(6.25, 10); // (8 + 10 + 2 + 5) / 4
  });

  it('has one point per day and null/zero values when no Item has a state', () => {
    const series = compute(mainItems(), current).dailySeries;
    expect(series.map((p) => p.date)).toEqual(['2025-01-06', '2025-01-07', '2025-01-08', '2025-01-09', '2025-01-10']);
    const empty = compute(mainItems(), { start: '2024-12-01', end: '2024-12-02' }).dailySeries[0];
    expect(empty).toEqual({
      date: '2024-12-01',
      stockValue: 0,
      excessStockValue: 0,
      belowMinimumCount: 0,
      medianAutonomyDays: null,
      stockTurnover: null,
      replenishmentTimeDays: null,
    });
  });

  it('covers only the kept slice', () => {
    const slice = computeIndicators(mainItems(), current, DEFAULT_INDICATOR_CONFIG, (r) => r.itemId === SNAP).dailySeries[0];
    expect(slice.stockValue).toBe(600);
    expect(slice.belowMinimumCount).toBe(0);
    expect(slice.medianAutonomyDays).toBeCloseTo(6, 10);
    expect(slice.stockTurnover).toBeCloseTo((100 * 365) / 600, 10);
    expect(slice.replenishmentTimeDays).toBe(8);
  });
});

describe('ABC Class', () => {
  const classes = (values: number[], config = DEFAULT_INDICATOR_CONFIG) => {
    const result = classifyAbc(
      values.map((stockValue, i) => ({ itemId: i + 1, stockValue })),
      config,
    );
    return values.map((_, i) => result.get(i + 1));
  };

  it('cumulative 50, 80, 90, 95, 98, 100: A up to 80%, B up to 95%, C after', () => {
    expect(classes([50, 30, 10, 5, 3, 2])).toEqual(['A', 'A', 'B', 'B', 'C', 'C']);
  });

  it('ranks by value whatever the input order', () => {
    expect(classes([2, 50, 5, 30, 10, 3])).toEqual(['C', 'A', 'B', 'A', 'B', 'C']);
  });

  it('thresholds are configurable: 50 / 90 gives A, B, B, C, C, C', () => {
    expect(classes([50, 30, 10, 5, 3, 2], { ...DEFAULT_INDICATOR_CONFIG, abcThresholdA: 50, abcThresholdB: 90 })).toEqual([
      'A',
      'B',
      'B',
      'C',
      'C',
      'C',
    ]);
  });

  it('Items with equal value share a class: 40, then three tied at 20 (cumulative 100 at the end of the tie)', () => {
    expect(classes([20, 40, 20, 20])).toEqual(['C', 'A', 'C', 'C']);
  });

  it('a tie that straddles no threshold keeps its members together: 60, 10, 10, 10, 10', () => {
    // 60 -> A (60). Tie of four at 10 ends at 100 -> C for all four, even though the first would be at 70.
    expect(classes([60, 10, 10, 10, 10])).toEqual(['A', 'C', 'C', 'C', 'C']);
  });

  it('a single dominant Item is A even above the threshold: 90 and 10', () => {
    expect(classes([90, 10])).toEqual(['A', 'C']);
  });

  it('with a total value of zero every Item is C', () => {
    expect(classes([0, 0, 0])).toEqual(['C', 'C', 'C']);
  });

  it('Items worth zero are C next to valuable ones', () => {
    expect(classes([100, 0])).toEqual(['A', 'C']);
  });

  it('is assigned from the Stock Value of the end date and written to each Item', () => {
    const items = [
      item(1, [snap('2025-01-01', 50, 0, 999, 1, 1, 1)]), // value 50
      item(2, [snap('2025-01-01', 30, 0, 999, 1, 1, 1)]), // 30
      item(3, [snap('2025-01-01', 10, 0, 999, 1, 1, 1)]), // 10
      item(4, [snap('2025-01-01', 5, 0, 999, 1, 1, 1)]), // 5
      item(5, [snap('2025-01-01', 3, 0, 999, 1, 1, 1)]), // 3
      item(6, [snap('2025-01-01', 2, 0, 999, 1, 1, 1)]), // 2
    ];
    const result = compute(items);
    expect(result.items.map((i) => i.abcClass)).toEqual(['A', 'A', 'B', 'B', 'C', 'C']);
    expect(result.portfolio.abcCounts).toEqual({ A: 2, B: 2, C: 2 });
  });
});
