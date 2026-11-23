import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client';
import { computeFromDatabase } from '../indicators/load-indicators';
import { PrismaService } from '../prisma/prisma.service';
import { createRecommendation, EMPTY_HISTORY, loadHistory } from './create-recommendation';
import { estimatedCost, type RecommendationFigures, type RecommendationType } from './recommendation-logic';

const INCLUDE = {
  item: { select: { id: true, name: true } },
  createdBy: { select: { id: true, name: true, status: true } },
  events: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], include: { user: { select: { id: true, name: true, status: true } } } },
} satisfies Prisma.RecommendationInclude;

type RecommendationRow = Prisma.RecommendationGetPayload<{ include: typeof INCLUDE }>;

export interface PersonView {
  id: number;
  /** "Name (removed)" when the User has been removed, so the history stays readable. */
  name: string;
  removed: boolean;
}

export interface RecommendationView {
  id: number;
  type: RecommendationType;
  status: string;
  itemId: number;
  itemName: string;
  quantity: number;
  estimatedCost: number;
  priorityScore: number | null;
  justification: string;
  figures: RecommendationFigures;
  /** Null: created by the system (auto-Draft). */
  createdBy: PersonView | null;
  discardReason: string | null;
  createdAt: string;
  updatedAt: string;
  history: {
    id: number;
    type: string;
    /** Null: done by the system. */
    user: PersonView | null;
    details: unknown;
    at: string;
  }[];
}

function person(user: { id: number; name: string; status: string } | null): PersonView | null {
  if (!user) return null;
  const removed = user.status === 'REMOVED';
  return { id: user.id, name: removed ? `${user.name} (removed)` : user.name, removed };
}

function toView(row: RecommendationRow): RecommendationView {
  return {
    id: row.id,
    type: row.type,
    status: row.status,
    itemId: row.itemId,
    itemName: row.item.name,
    quantity: row.quantity.toNumber(),
    estimatedCost: row.estimatedCost.toNumber(),
    priorityScore: row.priorityScore,
    justification: row.justification,
    figures: row.figures as unknown as RecommendationFigures,
    createdBy: person(row.createdBy),
    discardReason: row.discardReason,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    history: row.events.map((e) => ({
      id: e.id,
      type: e.type,
      user: person(e.user),
      details: e.details,
      at: e.createdAt.toISOString(),
    })),
  };
}

function isOpenDraftConflict(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: string }).code === 'P2002';
}

@Injectable()
export class RecommendationsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(filter: { itemId?: number; status?: string[]; type?: RecommendationType } = {}): Promise<RecommendationView[]> {
    const rows = await this.prisma.recommendation.findMany({
      where: {
        itemId: filter.itemId,
        type: filter.type,
        status: filter.status ? { in: filter.status as RecommendationRow['status'][] } : undefined,
      },
      include: INCLUDE,
      orderBy: { id: 'desc' },
    });
    return rows.map(toView);
  }

  async get(id: number): Promise<RecommendationView> {
    const row = await this.prisma.recommendation.findUnique({ where: { id }, include: INCLUDE });
    if (!row) throw new NotFoundException(`Recommendation ${id} not found`);
    return toView(row);
  }

  /** Manual Recommendation for any Item that has data. The quantity and justification default to the suggested ones. */
  async create(
    userId: number,
    input: { itemId: number; type: RecommendationType; quantity?: number; justification?: string },
  ): Promise<RecommendationView> {
    const item = await this.prisma.item.findUnique({ where: { id: input.itemId } });
    if (!item) throw new NotFoundException(`Item ${input.itemId} not found`);
    const computed = await computeFromDatabase(this.prisma);
    const indicators = computed.result?.items.find((i) => i.itemId === item.id);
    if (!indicators?.hasState) throw new BadRequestException('This Item has no data on the Reference Date');

    const history = (await loadHistory(this.prisma, [item.id])).get(item.id) ?? EMPTY_HISTORY;
    try {
      const created = await createRecommendation(this.prisma, {
        indicators,
        type: input.type,
        referenceDate: computed.referenceDate,
        history,
        createdById: userId,
        quantity: input.quantity,
        justification: input.justification,
      });
      return this.get(created.id);
    } catch (error) {
      if (isOpenDraftConflict(error)) {
        throw new ConflictException('This Item already has an open Draft of this type. Edit or Discard it first.');
      }
      throw error;
    }
  }

  /** Edits the quantity and/or justification of a Draft. */
  async edit(
    id: number,
    userId: number,
    changes: { quantity?: number; justification?: string },
  ): Promise<RecommendationView> {
    const current = await this.requireDraft(id);
    const data: Prisma.RecommendationUpdateInput = {};
    const details: Record<string, unknown> = {};

    if (changes.quantity !== undefined) {
      if (current.type === 'HOLD_PURCHASES') throw new BadRequestException('Hold Purchases has no quantity to edit');
      const unitCost = (current.figures as unknown as RecommendationFigures).unitCost;
      data.quantity = changes.quantity;
      data.estimatedCost = estimatedCost(changes.quantity, unitCost);
      details.quantity = { from: current.quantity.toNumber(), to: changes.quantity };
    }
    if (changes.justification !== undefined) {
      data.justification = changes.justification;
      details.justification = { from: current.justification, to: changes.justification };
    }
    if (Object.keys(details).length === 0) throw new BadRequestException('Nothing to change: send a quantity or a justification');

    // The status check is part of the update, so a concurrent Discard cannot be overwritten.
    const updated = await this.prisma.recommendation.updateMany({ where: { id, status: 'DRAFT' }, data });
    if (updated.count === 0) throw new ConflictException('Only Drafts can be edited');
    await this.prisma.recommendationEvent.create({
      data: { recommendationId: id, type: 'EDITED', userId, details: details as Prisma.InputJsonObject },
    });
    return this.get(id);
  }

  /** Discards a Draft. The Recommendation is kept, with its history and the optional reason. */
  async discard(id: number, userId: number, reason?: string): Promise<RecommendationView> {
    await this.requireDraft(id);
    const cleanReason = reason?.trim() || null;
    const updated = await this.prisma.recommendation.updateMany({
      where: { id, status: 'DRAFT' },
      data: { status: 'DISCARDED', discardReason: cleanReason },
    });
    if (updated.count === 0) throw new ConflictException('Only Drafts can be discarded');
    await this.prisma.recommendationEvent.create({
      data: { recommendationId: id, type: 'DISCARDED', userId, details: { reason: cleanReason } },
    });
    return this.get(id);
  }

  private async requireDraft(id: number) {
    const row = await this.prisma.recommendation.findUnique({ where: { id } });
    if (!row) throw new NotFoundException(`Recommendation ${id} not found`);
    if (row.status !== 'DRAFT') throw new ConflictException('Only Drafts can be changed');
    return row;
  }
}
