// Stale Draft detection (ticket 16): the LAST recalculation step. An open Draft (status DRAFT only; Pending
// Approval Drafts are frozen by their Indicator Snapshot) is stale when the figures it would get from the
// current indicators differ from the ones it was created (or last updated) with.
//
// Which fields count: the ones that drive the quantity, the cost, the ranking and the justification
// (STALE_FIELDS below). Trend, demand, turnover and the Reference Date itself do not: they only colour the
// text and would flag Drafts for noise. Numbers are compared with an absolute tolerance of 0.005 (figures
// are rounded to 2 decimals); text fields exactly.
//
// A person's manual edits to quantity/justification are never overwritten here: detection only sets the
// stale marker and stores `currentFigures`. The person decides with "Update to current data".
// Drafts are never deleted (ADR 0004), also when the Item returns to Normal: the Draft stays, perhaps stale.
//
// Notification: sent once per staleness episode (when the Draft becomes stale), to its owner (`createdBy`).
// System auto-Drafts (createdBy null) belong to the whole team, so every Active User is notified. If the
// owner is no longer Active, every Active User is notified instead so the warning is not lost.
import { Prisma } from '../generated/prisma/client';
import { requireIndicators, type RecalculationStep } from '../recalculation/recalculation';
import { notifyAllActiveUsers, notifyUser } from '../notifications/notifications';
import { buildFigures, type RecommendationFigures } from './recommendation-logic';

export const STALE_FIELDS = [
  'suggestedQuantity',
  'freedCapital',
  'currentStock',
  'minRequired',
  'maxCapacity',
  'unitCost',
  'replenishmentTimeDays',
  'stockAutonomyDays',
  'priorityScore',
  'abcClass',
  'urgencyLevel',
  'stockStatus',
] as const satisfies readonly (keyof RecommendationFigures)[];

export const STALE_TOLERANCE = 0.005;

export interface FigureChange {
  field: string;
  old: number | string | boolean | null;
  current: number | string | boolean | null;
}

function same(a: unknown, b: unknown): boolean {
  if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) <= STALE_TOLERANCE;
  return (a ?? null) === (b ?? null);
}

/** The counted fields whose value differs between the stored and the current figures. Empty: not stale. */
export function diffFigures(stored: Partial<RecommendationFigures>, current: RecommendationFigures): FigureChange[] {
  const changes: FigureChange[] = [];
  for (const field of STALE_FIELDS) {
    const old = stored[field] ?? null;
    const now = current[field] ?? null;
    if (!same(old, now)) changes.push({ field, old, current: now });
  }
  return changes;
}

export const staleDraftsStep: RecalculationStep = {
  name: 'stale-drafts',
  async run(context) {
    const { referenceDate, result } = requireIndicators(context);
    if (!result) return;
    const { prisma } = context;

    const drafts = await prisma.recommendation.findMany({
      where: { status: 'DRAFT' },
      include: { item: { select: { name: true } }, createdBy: { select: { id: true, status: true } } },
    });
    const byItem = new Map(result.items.map((i) => [i.itemId, i]));

    for (const draft of drafts) {
      const indicators = byItem.get(draft.itemId);
      // Without data on the Reference Date there is nothing to compare with: leave the Draft as it is.
      if (!indicators?.hasState || !indicators.state) continue;

      const current = buildFigures(indicators, draft.type, referenceDate);
      const stale = diffFigures(draft.figures as unknown as RecommendationFigures, current).length > 0;

      if (!stale) {
        if (draft.staleSince) {
          await prisma.recommendation.updateMany({
            where: { id: draft.id, status: 'DRAFT' },
            data: { staleSince: null, currentFigures: Prisma.DbNull, staleNotifiedAt: null },
          });
        }
        continue;
      }

      const becomesStale = !draft.staleSince;
      const updated = await prisma.recommendation.updateMany({
        where: { id: draft.id, status: 'DRAFT' },
        data: {
          currentFigures: current as unknown as Prisma.InputJsonObject,
          ...(becomesStale ? { staleSince: new Date() } : {}),
        },
      });
      if (updated.count === 0 || draft.staleNotifiedAt) continue;

      const content = {
        type: 'DRAFT_STALE' as const,
        recommendationId: draft.id,
        itemId: draft.itemId,
        message: `The data of Draft #${draft.id} for ${draft.item.name} has changed: review it or update it to current data`,
      };
      if (draft.createdBy?.status === 'ACTIVE') await notifyUser(prisma, draft.createdBy.id, content);
      else await notifyAllActiveUsers(prisma, content);
      await prisma.recommendation.update({ where: { id: draft.id }, data: { staleNotifiedAt: new Date() } });
    }
  },
};
