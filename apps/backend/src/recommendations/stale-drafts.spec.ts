import type { RecommendationFigures } from './recommendation-logic';
import { diffFigures } from './stale-drafts';

const base: RecommendationFigures = {
  referenceDate: '2025-01-10',
  currentStock: 30,
  minRequired: 20,
  maxCapacity: 100,
  unitCost: 5,
  avgUsagePerDay: 3,
  replenishmentTimeDays: 2,
  stockAutonomyDays: 10,
  abcClass: 'A',
  stockStatus: 'LOW',
  urgencyLevel: 'CRITICAL',
  priorityScore: 80.5,
  consumptionTrendPct: 5,
  estimatedDemand30d: 90,
  stockTurnover: 20,
  lowTurnover: false,
  suggestedQuantity: 76,
  freedCapital: 0,
};

describe('diffFigures', () => {
  it('finds no change for identical figures', () => {
    expect(diffFigures(base, { ...base })).toEqual([]);
  });

  it('ignores differences below the tolerance', () => {
    expect(diffFigures(base, { ...base, priorityScore: 80.502, stockAutonomyDays: 10.001 })).toEqual([]);
  });

  it('reports numeric and text changes as old vs current', () => {
    const changes = diffFigures(base, { ...base, suggestedQuantity: 126, urgencyLevel: 'ATTENTION' });
    expect(changes).toEqual([
      { field: 'suggestedQuantity', old: 76, current: 126 },
      { field: 'urgencyLevel', old: 'CRITICAL', current: 'ATTENTION' },
    ]);
  });

  it('does not count fields that only colour the text (trend, demand, Reference Date)', () => {
    expect(diffFigures(base, { ...base, referenceDate: '2025-02-01', consumptionTrendPct: -40, estimatedDemand30d: 1 })).toEqual([]);
  });

  it('treats null and a number as different', () => {
    expect(diffFigures(base, { ...base, stockAutonomyDays: null })).toEqual([{ field: 'stockAutonomyDays', old: 10, current: null }]);
  });
});
