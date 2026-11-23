// Purchase Planning API: the urgency ranking with the reasons for each Item's place.
import { Controller, Get, Injectable, Module } from '@nestjs/common';
import { computeFromDatabase } from '../indicators/load-indicators';
import type { AbcClass, StockStatus, UrgencyLevel } from '../indicators/types';
import { PrismaService } from '../prisma/prisma.service';
import {
  compareForRanking,
  estimatedCost,
  freedCapital,
  rankingReasons,
  replenishQuantity,
} from '../recommendations/recommendation-logic';

export interface RankingRow {
  rank: number;
  itemId: number;
  sourceItemId: number;
  name: string;
  category: string;
  urgencyLevel: UrgencyLevel;
  priorityScore: number | null;
  abcClass: AbcClass | null;
  stockStatus: StockStatus | null;
  currentStock: number;
  minRequired: number;
  maxCapacity: number;
  stockAutonomyDays: number | null;
  replenishmentTimeDays: number;
  reasons: string[];
  /** What a Replenish Recommendation would buy now, and what it would cost. */
  suggestedQuantity: number;
  suggestedCost: number;
  /** Tied-up capital a Hold Purchases Recommendation would free; 0 when the Item does not call for one. */
  freedCapital: number;
  holdPurchasesSuggested: boolean;
}

export interface RankingResponse {
  referenceDate: string | null;
  items: RankingRow[];
}

@Injectable()
export class PlanningService {
  constructor(private readonly prisma: PrismaService) {}

  async ranking(): Promise<RankingResponse> {
    const { referenceDate, result } = await computeFromDatabase(this.prisma);
    if (!result) return { referenceDate, items: [] };
    const items = await this.prisma.item.findMany();
    const byId = new Map(items.map((i) => [i.id, i]));

    const ranked = result.items.filter((i) => i.hasState && i.state).sort(compareForRanking);
    return {
      referenceDate,
      items: ranked.map((ind, index) => {
        const item = byId.get(ind.itemId)!;
        const state = ind.state!;
        const quantity = replenishQuantity(state);
        const holdSuggested = ind.stockStatus === 'EXCESS' || ind.lowTurnover === true;
        return {
          rank: index + 1,
          itemId: item.id,
          sourceItemId: item.sourceItemId,
          name: item.name,
          category: item.category,
          urgencyLevel: ind.urgencyLevel ?? 'NORMAL',
          priorityScore: ind.priorityScore,
          abcClass: ind.abcClass,
          stockStatus: ind.stockStatus,
          currentStock: state.currentStock,
          minRequired: state.minRequired,
          maxCapacity: state.maxCapacity,
          stockAutonomyDays: ind.stockAutonomyDays,
          replenishmentTimeDays: state.replenishmentTimeDays,
          reasons: rankingReasons(ind),
          suggestedQuantity: quantity,
          suggestedCost: estimatedCost(quantity, state.unitCost),
          freedCapital: holdSuggested ? freedCapital(ind) : 0,
          holdPurchasesSuggested: holdSuggested,
        };
      }),
    };
  }
}

@Controller('planning')
export class PlanningController {
  constructor(private readonly planning: PlanningService) {}

  /** Items ranked by Urgency Level, then Priority Score, with the reasons. Requires login (global guard). */
  @Get('ranking')
  ranking(): Promise<RankingResponse> {
    return this.planning.ranking();
  }
}

@Module({ controllers: [PlanningController], providers: [PlanningService] })
export class PlanningModule {}
