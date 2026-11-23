import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client';
import { AlertsService } from '../alerts/alerts.module';
import { CLOCK, type Clock } from '../clock/clock';
import { computeFromDatabase } from '../indicators/load-indicators';
import { notifyUser } from '../notifications/notifications';
import { PrismaService } from '../prisma/prisma.service';
import { createRecommendation, EMPTY_HISTORY, loadHistory } from './create-recommendation';
import { diffFigures, type FigureChange } from './stale-drafts';
import { updateToCurrent } from './update-to-current';
import { estimatedCost, type RecommendationFigures, type RecommendationType } from './recommendation-logic';

const INCLUDE = {
  item: { select: { id: true, name: true } },
  createdBy: { select: { id: true, name: true, status: true } },
  submittedBy: { select: { id: true, name: true, status: true } },
  decidedBy: { select: { id: true, name: true, status: true } },
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
  /** Stale Draft (ticket 16): the figures no longer match the current indicators. */
  stale: boolean;
  staleSince: string | null;
  /** Old (stored) vs current figures that differ; empty when not stale. */
  oldVsCurrent: FigureChange[];
  /** Null: created by the system (auto-Draft). */
  createdBy: PersonView | null;
  discardReason: string | null;
  submittedBy: PersonView | null;
  submittedAt: string | null;
  decidedBy: PersonView | null;
  decidedAt: string | null;
  /** The Director's comment (mandatory on Reject). */
  decisionComment: string | null;
  /** When it was Approved: the start of Replenishment in Progress (ticket 17). */
  approvedAt: string | null;
  /** Frozen at Submit: the Item's indicators and the Draft's figures at that moment. Null before Submit. */
  indicatorSnapshot: unknown;
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
    stale: row.staleSince !== null,
    staleSince: row.staleSince?.toISOString() ?? null,
    oldVsCurrent:
      row.staleSince && row.currentFigures
        ? diffFigures(row.figures as unknown as RecommendationFigures, row.currentFigures as unknown as RecommendationFigures)
        : [],
    createdBy: person(row.createdBy),
    discardReason: row.discardReason,
    submittedBy: person(row.submittedBy),
    submittedAt: row.submittedAt?.toISOString() ?? null,
    decidedBy: person(row.decidedBy),
    decidedAt: row.decidedAt?.toISOString() ?? null,
    decisionComment: row.decisionComment,
    approvedAt: row.approvedAt?.toISOString() ?? null,
    indicatorSnapshot: row.indicatorSnapshot,
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
  constructor(
    private readonly prisma: PrismaService,
    private readonly alerts: AlertsService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

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

  /** The Pending Approval Recommendations with the highest Priority Score, for the Dashboard widget. */
  async topPending(limit: number): Promise<RecommendationView[]> {
    const rows = await this.prisma.recommendation.findMany({
      where: { status: 'PENDING_APPROVAL' },
      include: INCLUDE,
      orderBy: [{ priorityScore: { sort: 'desc', nulls: 'last' } }, { id: 'asc' }],
      take: limit,
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

  /** Refreshes a Stale Draft with the current data (409 when it is not stale). */
  async updateToCurrent(id: number, userId: number): Promise<RecommendationView> {
    await updateToCurrent(this.prisma, id, userId);
    return this.get(id);
  }

  /**
   * Draft -> Pending Approval. Freezes the Indicator Snapshot: the Item's current indicators plus the Draft's
   * figures, quantity, cost and justification at this moment, so the Director decides on what was justified.
   */
  async submit(id: number, userId: number): Promise<RecommendationView> {
    const draft = await this.requireDraft(id);
    const computed = await computeFromDatabase(this.prisma);
    const indicators = computed.result?.items.find((i) => i.itemId === draft.itemId) ?? null;
    const now = this.clock.now();
    const snapshot = {
      takenAt: now.toISOString(),
      referenceDate: computed.referenceDate,
      quantity: draft.quantity.toNumber(),
      estimatedCost: draft.estimatedCost.toNumber(),
      justification: draft.justification,
      figures: draft.figures,
      indicators,
    };
    // The status check is part of the update, so a concurrent Discard or Submit cannot be overwritten.
    const updated = await this.prisma.recommendation.updateMany({
      where: { id, status: 'DRAFT' },
      data: {
        status: 'PENDING_APPROVAL',
        submittedById: userId,
        submittedAt: now,
        indicatorSnapshot: snapshot as unknown as Prisma.InputJsonObject,
      },
    });
    if (updated.count === 0) throw new ConflictException('Only Drafts can be submitted');
    await this.prisma.recommendationEvent.create({ data: { recommendationId: id, type: 'SUBMITTED', userId } });
    if (draft.type === 'REPLENISH') await this.coupleAlert(draft.itemId, 'ACKNOWLEDGED', id);
    return this.get(id);
  }

  /** Pending Approval -> Approved (Director). The Item's open Alert becomes Resolved. Nothing is ordered from Hosstock. */
  async approve(id: number, userId: number): Promise<RecommendationView> {
    const row = await this.decide(id, userId, 'APPROVED', null);
    if (row.type === 'REPLENISH') await this.coupleAlert(row.itemId, 'RESOLVED', id);
    return this.get(id);
  }

  /** Pending Approval -> Rejected (Director), with a mandatory comment. */
  async reject(id: number, userId: number, comment: string): Promise<RecommendationView> {
    const clean = comment?.trim();
    if (!clean) throw new BadRequestException('Write a comment explaining the rejection');
    await this.decide(id, userId, 'REJECTED', clean);
    return this.get(id);
  }

  private async decide(id: number, userId: number, status: 'APPROVED' | 'REJECTED', comment: string | null) {
    const row = await this.prisma.recommendation.findUnique({ where: { id }, include: { item: { select: { name: true } } } });
    if (!row) throw new NotFoundException(`Recommendation ${id} not found`);
    if (row.status !== 'PENDING_APPROVAL') throw new ConflictException('Only Recommendations pending approval can be decided');
    const now = this.clock.now();
    // The status check is part of the update, so two concurrent decisions cannot both win.
    const updated = await this.prisma.recommendation.updateMany({
      where: { id, status: 'PENDING_APPROVAL' },
      data: {
        status,
        decidedById: userId,
        decidedAt: now,
        decisionComment: comment,
        approvedAt: status === 'APPROVED' ? now : null,
      },
    });
    if (updated.count === 0) throw new ConflictException('Only Recommendations pending approval can be decided');
    await this.prisma.recommendationEvent.create({
      data: { recommendationId: id, type: status, userId, details: { comment } },
    });
    // Only the person who submitted it is notified.
    if (row.submittedById !== null) {
      const message =
        status === 'APPROVED'
          ? `Your recommendation for ${row.item.name} was approved: ready to process outside Hosstock`
          : `Your recommendation for ${row.item.name} was rejected: ${comment}`;
      await notifyUser(this.prisma, row.submittedById, {
        type: 'RECOMMENDATION_DECISION',
        message,
        itemId: row.itemId,
        recommendationId: id,
      });
    }
    return row;
  }

  /** Replenish coupling: moves the Item's open Alert, if any, as "system, via Recommendation #N". */
  private async coupleAlert(itemId: number, status: 'ACKNOWLEDGED' | 'RESOLVED', recommendationId: number) {
    const alert = await this.prisma.alert.findFirst({ where: { itemId, status: { not: 'CLEARED' } } });
    if (!alert || alert.status === status) return;
    await this.alerts.changeStatusViaRecommendation(alert.id, status, recommendationId);
  }

  private async requireDraft(id: number) {
    const row = await this.prisma.recommendation.findUnique({ where: { id } });
    if (!row) throw new NotFoundException(`Recommendation ${id} not found`);
    if (row.status !== 'DRAFT') throw new ConflictException('Only Drafts can be changed');
    return row;
  }
}
