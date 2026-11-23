// Pure rules of Recommendations: quantity, cost, freed capital, the figures a Draft keeps, and the
// deterministic justification templates (no LLM). No I/O here.
import type { ItemIndicators, ItemState } from '../indicators/types';

export type RecommendationType = 'REPLENISH' | 'HOLD_PURCHASES';

/** Past Recommendations of the Item, quoted in the justification as "history". */
export interface RecommendationHistory {
  total: number;
  approved: number;
  rejected: number;
  discarded: number;
}

/** The indicator figures a Recommendation was created with. Stale Draft detection compares these (ticket 16). */
export interface RecommendationFigures {
  referenceDate: string | null;
  currentStock: number;
  minRequired: number;
  maxCapacity: number;
  unitCost: number;
  avgUsagePerDay: number;
  replenishmentTimeDays: number;
  stockAutonomyDays: number | null;
  abcClass: string | null;
  stockStatus: string | null;
  urgencyLevel: string | null;
  priorityScore: number | null;
  consumptionTrendPct: number | null;
  estimatedDemand30d: number | null;
  stockTurnover: number | null;
  lowTurnover: boolean | null;
  /** Suggested Replenish quantity at creation time (0 for Hold Purchases). */
  suggestedQuantity: number;
  /** Capital that Hold Purchases would free (0 for Replenish). */
  freedCapital: number;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

/** max(0, effective maximum - (stock - usage x Replenishment Time)): what brings the Item back to its maximum on arrival. */
export function replenishQuantity(state: ItemState): number {
  const stockOnArrival = state.currentStock - state.avgUsagePerDay * state.replenishmentTimeDays;
  return round2(Math.max(0, state.maxCapacity - stockOnArrival));
}

export function estimatedCost(quantity: number, unitCost: number): number {
  return round2(quantity * unitCost);
}

/** Capital tied up that Hold Purchases would free: the excess value when there is Excess Stock, else the whole Stock Value. */
export function freedCapital(indicators: Pick<ItemIndicators, 'excessStockValue' | 'stockValue'>): number {
  const excess = indicators.excessStockValue ?? 0;
  return round2(excess > 0 ? excess : (indicators.stockValue ?? 0));
}

/** Figures for an Item with a state. Throws when the Item has none. */
export function buildFigures(
  indicators: ItemIndicators,
  type: RecommendationType,
  referenceDate: string | null,
): RecommendationFigures {
  const state = indicators.state;
  if (!state) throw new Error(`Item ${indicators.itemId} has no state to build a Recommendation from`);
  return {
    referenceDate,
    currentStock: state.currentStock,
    minRequired: state.minRequired,
    maxCapacity: state.maxCapacity,
    unitCost: state.unitCost,
    avgUsagePerDay: state.avgUsagePerDay,
    replenishmentTimeDays: state.replenishmentTimeDays,
    stockAutonomyDays: indicators.stockAutonomyDays,
    abcClass: indicators.abcClass,
    stockStatus: indicators.stockStatus,
    urgencyLevel: indicators.urgencyLevel,
    priorityScore: indicators.priorityScore,
    consumptionTrendPct: indicators.consumptionTrendPct,
    estimatedDemand30d: indicators.estimatedDemand30d,
    stockTurnover: indicators.stockTurnover,
    lowTurnover: indicators.lowTurnover,
    suggestedQuantity: type === 'REPLENISH' ? replenishQuantity(state) : 0,
    freedCapital: type === 'HOLD_PURCHASES' ? freedCapital(indicators) : 0,
  };
}

const num = (n: number): string => String(round2(n));
const money = (n: number): string => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function autonomyPhrase(f: RecommendationFigures): string {
  if (f.stockAutonomyDays === null) return 'The Item has no consumption, so its stock never runs out';
  const rt = num(f.replenishmentTimeDays);
  const a = num(f.stockAutonomyDays);
  if (f.stockAutonomyDays < f.replenishmentTimeDays) {
    return `Stock autonomy is ${a} days, shorter than the Replenishment Time of ${rt} days`;
  }
  return `Stock autonomy is ${a} days against a Replenishment Time of ${rt} days`;
}

function trendPhrase(f: RecommendationFigures): string | null {
  if (f.consumptionTrendPct === null) return null;
  const pct = num(f.consumptionTrendPct);
  if (f.consumptionTrendPct > 0) return `consumption is rising (${pct}% between the two halves of the period)`;
  if (f.consumptionTrendPct < 0) return `consumption is falling (${pct}% between the two halves of the period)`;
  return 'consumption is flat over the period';
}

function historyPhrase(h: RecommendationHistory): string {
  if (h.total === 0) return 'No earlier Recommendations exist for this Item';
  return `Earlier Recommendations for this Item: ${h.total} (${h.approved} approved, ${h.rejected} rejected, ${h.discarded} discarded)`;
}

/**
 * Justification text quoting the specific indicators. Same inputs always give the same text.
 * `quantity` is the quantity of the Recommendation (a manual one may differ from the suggestion).
 */
export function buildJustification(
  type: RecommendationType,
  f: RecommendationFigures,
  history: RecommendationHistory,
  quantity: number,
): string {
  const sentences: string[] = [];
  const demand = f.estimatedDemand30d === null ? null : `Estimated Demand for the next 30 days is ${num(f.estimatedDemand30d)} units`;
  const trend = trendPhrase(f);

  if (type === 'REPLENISH') {
    sentences.push(`${autonomyPhrase(f)}.`);
    sentences.push(
      `Stock is ${num(f.currentStock)} against a minimum of ${num(f.minRequired)} and a maximum of ${num(f.maxCapacity)} (Urgency Level ${f.urgencyLevel ?? 'unknown'}, ABC Class ${f.abcClass ?? 'unknown'}).`,
    );
    if (trend) sentences.push(`${trend[0].toUpperCase()}${trend.slice(1)}.`);
    if (demand) sentences.push(`${demand}.`);
    sentences.push(
      `Buying ${num(quantity)} units (about ${money(estimatedCost(quantity, f.unitCost))} at ${money(f.unitCost)} per unit) brings stock back to the maximum when the order arrives.`,
    );
  } else {
    const reasons: string[] = [];
    if (f.stockStatus === 'EXCESS') {
      reasons.push(`Stock of ${num(f.currentStock)} is above the maximum of ${num(f.maxCapacity)} (Excess Stock)`);
    }
    if (f.lowTurnover) {
      reasons.push(
        `Stock Turnover is ${f.stockTurnover === null ? 'undefined' : `${num(f.stockTurnover)} per year`}, which makes this a Low-Turnover Item`,
      );
    }
    if (reasons.length === 0) reasons.push(`Stock is ${num(f.currentStock)} against a maximum of ${num(f.maxCapacity)}`);
    sentences.push(`${reasons.join('. ')}.`);
    sentences.push(`${autonomyPhrase(f)} (ABC Class ${f.abcClass ?? 'unknown'}).`);
    if (trend) sentences.push(`${trend[0].toUpperCase()}${trend.slice(1)}.`);
    if (demand) sentences.push(`${demand}.`);
    sentences.push(`Holding purchases would free about ${money(f.freedCapital)} of tied-up capital.`);
  }
  sentences.push(`${historyPhrase(history)}.`);
  return sentences.join(' ');
}

/** Why an Item sits at its place in the Purchase Planning ranking. */
export function rankingReasons(indicators: ItemIndicators): string[] {
  const state = indicators.state;
  if (!state) return [];
  const reasons: string[] = [];
  const rt = num(state.replenishmentTimeDays);
  if (indicators.stockAutonomyDays !== null) {
    const a = num(indicators.stockAutonomyDays);
    reasons.push(
      indicators.stockAutonomyDays < state.replenishmentTimeDays
        ? `Autonomy ${a} days is shorter than the Replenishment Time of ${rt} days`
        : `Autonomy ${a} days covers the Replenishment Time of ${rt} days`,
    );
  } else {
    reasons.push('No consumption: stock never runs out');
  }
  if (indicators.belowMinimum) {
    reasons.push(`Stock ${num(state.currentStock)} is below the minimum of ${num(state.minRequired)}`);
  }
  if (indicators.stockStatus === 'EXCESS') {
    reasons.push(`Stock ${num(state.currentStock)} is above the maximum of ${num(state.maxCapacity)}`);
  }
  if (indicators.lowTurnover) reasons.push('Low turnover');
  if (indicators.abcClass) reasons.push(`ABC Class ${indicators.abcClass}`);
  return reasons;
}

const URGENCY_ORDER: Record<string, number> = { CRITICAL: 0, ATTENTION: 1, NORMAL: 2 };

/** Sort key for the ranking: Urgency Level first (Critical, Attention, Normal), then Priority Score, highest first. */
export function compareForRanking(
  a: Pick<ItemIndicators, 'urgencyLevel' | 'priorityScore' | 'itemId'>,
  b: Pick<ItemIndicators, 'urgencyLevel' | 'priorityScore' | 'itemId'>,
): number {
  const byUrgency = (URGENCY_ORDER[a.urgencyLevel ?? 'NORMAL'] ?? 2) - (URGENCY_ORDER[b.urgencyLevel ?? 'NORMAL'] ?? 2);
  if (byUrgency !== 0) return byUrgency;
  const byScore = (b.priorityScore ?? 0) - (a.priorityScore ?? 0);
  return byScore !== 0 ? byScore : a.itemId - b.itemId;
}

/** Which auto-Drafts the indicators call for. */
export function autoDraftTypes(indicators: ItemIndicators): RecommendationType[] {
  if (!indicators.hasState || !indicators.state) return [];
  const types: RecommendationType[] = [];
  if (indicators.urgencyLevel === 'CRITICAL' || indicators.urgencyLevel === 'ATTENTION') {
    if (replenishQuantity(indicators.state) > 0) types.push('REPLENISH');
  }
  if (indicators.stockStatus === 'EXCESS' || indicators.lowTurnover) types.push('HOLD_PURCHASES');
  return types;
}
