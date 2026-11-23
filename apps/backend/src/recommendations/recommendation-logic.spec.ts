import type { ItemIndicators, ItemState } from '../indicators/types';
import {
  autoDraftTypes,
  buildFigures,
  buildJustification,
  compareForRanking,
  estimatedCost,
  freedCapital,
  rankingReasons,
  replenishQuantity,
} from './recommendation-logic';

const state = (over: Partial<ItemState> = {}): ItemState => ({
  snapshotDate: '2025-01-10',
  currentStock: 60,
  minRequired: 40,
  maxCapacity: 200,
  unitCost: 2.5,
  avgUsagePerDay: 10,
  replenishmentTimeDays: 6,
  ...over,
});

const indicators = (over: Partial<ItemIndicators> = {}, st: ItemState | null = state()): ItemIndicators => ({
  itemId: 1,
  hasState: st !== null,
  state: st,
  stockAutonomyDays: 6,
  stockTurnover: 30,
  daysOfInventory: 12,
  replenishmentTimeDays: 6,
  abcClass: 'A',
  belowMinimum: false,
  minAboveMax: false,
  stockStatus: 'REORDER_NEEDED',
  urgencyLevel: 'ATTENTION',
  priorityScore: 200,
  stockValue: 150,
  excessStockValue: 0,
  lowTurnover: false,
  consumptionTrendPct: 12.5,
  estimatedDemand30d: 300,
  annualConsumptionValue: null,
  meanStockValue: null,
  ...over,
});

const noHistory = { total: 0, approved: 0, rejected: 0, discarded: 0 };

describe('replenishQuantity and estimatedCost', () => {
  it('is max - (stock - usage x Replenishment Time)', () => {
    // stock on arrival = 60 - 10 x 6 = 0, so 200 - 0
    expect(replenishQuantity(state())).toBe(200);
    expect(estimatedCost(200, 2.5)).toBe(500);
  });
  it('never goes below 0', () => {
    expect(replenishQuantity(state({ currentStock: 1000 }))).toBe(0);
  });
  it('accounts for stock consumed during the Replenishment Time', () => {
    expect(replenishQuantity(state({ currentStock: 100, avgUsagePerDay: 5, replenishmentTimeDays: 4 }))).toBe(120);
  });
});

describe('freedCapital', () => {
  it('is the excess value when there is Excess Stock, else the Stock Value', () => {
    expect(freedCapital({ excessStockValue: 4000, stockValue: 20000 })).toBe(4000);
    expect(freedCapital({ excessStockValue: 0, stockValue: 100 })).toBe(100);
  });
});

describe('buildFigures', () => {
  it('keeps the quantity for Replenish and the freed capital for Hold Purchases', () => {
    expect(buildFigures(indicators(), 'REPLENISH', '2025-01-10')).toMatchObject({ suggestedQuantity: 200, freedCapital: 0 });
    expect(buildFigures(indicators({ excessStockValue: 80 }), 'HOLD_PURCHASES', null)).toMatchObject({
      suggestedQuantity: 0,
      freedCapital: 80,
    });
  });
  it('throws for an Item without state', () => {
    expect(() => buildFigures(indicators({}, null), 'REPLENISH', null)).toThrow();
  });
});

describe('buildJustification', () => {
  const figures = buildFigures(indicators(), 'REPLENISH', '2025-01-10');

  it('quotes autonomy vs Replenishment Time, ABC Class, trend, Estimated Demand and history for Replenish', () => {
    const text = buildJustification('REPLENISH', figures, { total: 3, approved: 1, rejected: 1, discarded: 1 }, 200);
    expect(text).toContain('Stock autonomy is 6 days against a Replenishment Time of 6 days');
    expect(text).toContain('ABC Class A');
    expect(text).toContain('Consumption is rising (12.5%');
    expect(text).toContain('Estimated Demand for the next 30 days is 300 units');
    expect(text).toContain('Earlier Recommendations for this Item: 3 (1 approved, 1 rejected, 1 discarded)');
    expect(text).toContain('Buying 200 units (about 500.00');
  });

  it('says when autonomy is shorter than the Replenishment Time', () => {
    const f = buildFigures(indicators({ stockAutonomyDays: 2 }), 'REPLENISH', null);
    expect(buildJustification('REPLENISH', f, noHistory, 10)).toContain('shorter than the Replenishment Time of 6 days');
  });

  it('is deterministic', () => {
    expect(buildJustification('REPLENISH', figures, noHistory, 200)).toBe(buildJustification('REPLENISH', figures, noHistory, 200));
  });

  it('explains Hold Purchases with the freed capital and the reason', () => {
    const f = buildFigures(
      indicators({ stockStatus: 'EXCESS', excessStockValue: 4000, lowTurnover: true, stockTurnover: 3 }),
      'HOLD_PURCHASES',
      null,
    );
    const text = buildJustification('HOLD_PURCHASES', f, noHistory, 0);
    expect(text).toContain('Excess Stock');
    expect(text).toContain('Low-Turnover Item');
    expect(text).toContain('free about 4,000.00 of tied-up capital');
    expect(text).toContain('No earlier Recommendations exist');
  });

  it('copes with missing trend, demand and consumption', () => {
    const f = buildFigures(
      indicators({ consumptionTrendPct: null, estimatedDemand30d: null, stockAutonomyDays: null }),
      'REPLENISH',
      null,
    );
    const text = buildJustification('REPLENISH', f, noHistory, 5);
    expect(text).not.toContain('Estimated Demand');
    expect(text).toContain('no consumption');
  });
});

describe('rankingReasons', () => {
  it('gives autonomy vs Replenishment Time, minimum and ABC Class', () => {
    const reasons = rankingReasons(indicators({ stockAutonomyDays: 2, belowMinimum: true }));
    expect(reasons).toEqual([
      'Autonomy 2 days is shorter than the Replenishment Time of 6 days',
      'Stock 60 is below the minimum of 40',
      'ABC Class A',
    ]);
  });
});

describe('compareForRanking', () => {
  it('orders by Urgency Level, then Priority Score descending', () => {
    const rows = [
      { itemId: 1, urgencyLevel: 'NORMAL', priorityScore: 900 },
      { itemId: 2, urgencyLevel: 'ATTENTION', priorityScore: 10 },
      { itemId: 3, urgencyLevel: 'CRITICAL', priorityScore: 5 },
      { itemId: 4, urgencyLevel: 'CRITICAL', priorityScore: 50 },
    ] as const;
    expect([...rows].sort(compareForRanking).map((r) => r.itemId)).toEqual([4, 3, 2, 1]);
  });
});

describe('autoDraftTypes', () => {
  it('Replenish for Critical and Attention Items', () => {
    expect(autoDraftTypes(indicators({ urgencyLevel: 'CRITICAL' }))).toEqual(['REPLENISH']);
    expect(autoDraftTypes(indicators({ urgencyLevel: 'ATTENTION' }))).toEqual(['REPLENISH']);
    expect(autoDraftTypes(indicators({ urgencyLevel: 'NORMAL' }))).toEqual([]);
  });
  it('Hold Purchases for Excess Stock or Low-Turnover Items', () => {
    expect(autoDraftTypes(indicators({ urgencyLevel: 'NORMAL', stockStatus: 'EXCESS' }))).toEqual(['HOLD_PURCHASES']);
    expect(autoDraftTypes(indicators({ urgencyLevel: 'NORMAL', lowTurnover: true }))).toEqual(['HOLD_PURCHASES']);
  });
  it('skips a Replenish of zero units and Items without state', () => {
    expect(autoDraftTypes(indicators({ urgencyLevel: 'CRITICAL' }, state({ currentStock: 1000 })))).toEqual([]);
    expect(autoDraftTypes(indicators({}, null))).toEqual([]);
  });
});
