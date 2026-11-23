// Creating a Recommendation (auto-Draft or manual): the one place that writes the row and its "created" event.
import type { Prisma, PrismaClient } from '../generated/prisma/client';
import type { ItemIndicators } from '../indicators/types';
import {
  buildFigures,
  buildJustification,
  estimatedCost,
  replenishQuantity,
  type RecommendationHistory,
  type RecommendationType,
} from './recommendation-logic';

export const EMPTY_HISTORY: RecommendationHistory = { total: 0, approved: 0, rejected: 0, discarded: 0 };

/** Past Recommendations per Item, for the "history" sentence of the justification. */
export async function loadHistory(prisma: PrismaClient, itemIds: number[]): Promise<Map<number, RecommendationHistory>> {
  const rows = await prisma.recommendation.groupBy({
    by: ['itemId', 'status'],
    where: { itemId: { in: itemIds } },
    _count: { _all: true },
  });
  const result = new Map<number, RecommendationHistory>();
  for (const row of rows) {
    const h = result.get(row.itemId) ?? { ...EMPTY_HISTORY };
    h.total += row._count._all;
    if (row.status === 'APPROVED') h.approved += row._count._all;
    if (row.status === 'REJECTED') h.rejected += row._count._all;
    if (row.status === 'DISCARDED') h.discarded += row._count._all;
    result.set(row.itemId, h);
  }
  return result;
}

export interface NewRecommendation {
  indicators: ItemIndicators;
  type: RecommendationType;
  referenceDate: string | null;
  history: RecommendationHistory;
  /** Null: created by the system (auto-Draft). */
  createdById: number | null;
  /** Manual overrides. Hold Purchases always has quantity 0. */
  quantity?: number;
  justification?: string;
}

/** Creates a Draft with its figures, justification and "created" history event. */
export async function createRecommendation(prisma: PrismaClient, input: NewRecommendation) {
  const { indicators, type } = input;
  const figures = buildFigures(indicators, type, input.referenceDate);
  const quantity = type === 'REPLENISH' ? (input.quantity ?? replenishQuantity(indicators.state!)) : 0;
  const justification = input.justification?.trim() || buildJustification(type, figures, input.history, quantity);
  return prisma.recommendation.create({
    data: {
      type,
      status: 'DRAFT',
      itemId: indicators.itemId,
      quantity,
      estimatedCost: type === 'REPLENISH' ? estimatedCost(quantity, figures.unitCost) : 0,
      priorityScore: indicators.priorityScore,
      justification,
      figures: figures as unknown as Prisma.InputJsonObject,
      createdById: input.createdById,
      events: { create: { type: 'CREATED', userId: input.createdById } },
    },
  });
}
