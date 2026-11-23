// "Update to current data" for a Stale Draft: refreshes figures, quantity, estimated cost, priority score and
// regenerates the justification from the current indicators. Replaces a manual edit on purpose: the person asked.
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma, type PrismaClient } from '../generated/prisma/client';
import { computeFromDatabase } from '../indicators/load-indicators';
import { EMPTY_HISTORY, loadHistory } from './create-recommendation';
import { buildFigures, buildJustification, estimatedCost, replenishQuantity } from './recommendation-logic';

export async function updateToCurrent(prisma: PrismaClient, id: number, userId: number): Promise<void> {
  const draft = await prisma.recommendation.findUnique({ where: { id } });
  if (!draft) throw new NotFoundException(`Recommendation ${id} not found`);
  if (draft.status !== 'DRAFT' || !draft.staleSince) throw new ConflictException('Only Stale Drafts can be updated to current data');

  const computed = await computeFromDatabase(prisma);
  const indicators = computed.result?.items.find((i) => i.itemId === draft.itemId);
  if (!indicators?.hasState || !indicators.state) throw new BadRequestException('This Item has no data on the Reference Date');

  const figures = buildFigures(indicators, draft.type, computed.referenceDate);
  const quantity = draft.type === 'REPLENISH' ? replenishQuantity(indicators.state) : 0;
  const cost = draft.type === 'REPLENISH' ? estimatedCost(quantity, figures.unitCost) : 0;
  const history = (await loadHistory(prisma, [draft.itemId])).get(draft.itemId) ?? { ...EMPTY_HISTORY };
  const justification = buildJustification(draft.type, figures, history, quantity);

  const updated = await prisma.recommendation.updateMany({
    where: { id, status: 'DRAFT', staleSince: { not: null } },
    data: {
      figures: figures as unknown as Prisma.InputJsonObject,
      quantity,
      estimatedCost: cost,
      priorityScore: indicators.priorityScore,
      justification,
      staleSince: null,
      currentFigures: Prisma.DbNull,
      staleNotifiedAt: null,
    },
  });
  if (updated.count === 0) throw new ConflictException('Only Stale Drafts can be updated to current data');
  await prisma.recommendationEvent.create({
    data: {
      recommendationId: id,
      type: 'UPDATED_TO_CURRENT',
      userId,
      details: {
        quantity: { from: draft.quantity.toNumber(), to: quantity },
        estimatedCost: { from: draft.estimatedCost.toNumber(), to: cost },
      },
    },
  });
}
