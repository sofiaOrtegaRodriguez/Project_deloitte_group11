import type { PrismaClient } from '../generated/prisma/client';
import { computeFromDatabase } from '../indicators/load-indicators';
import { replenishmentStatus, type ReplenishmentStatus } from './replenishment-rule';

const iso = (date: Date): string => date.toISOString().slice(0, 10);

/** The Item's latest Approved Replenish Recommendation that has an Approval Reference Date. */
export async function latestApprovedReplenishment(prisma: PrismaClient, itemId: number) {
  return prisma.recommendation.findFirst({
    where: { itemId, type: 'REPLENISH', status: 'APPROVED', approvalReferenceDate: { not: null } },
    orderBy: [{ approvedAt: 'desc' }, { id: 'desc' }],
  });
}

type ApprovedRow = { approvalReferenceDate: Date | null; replenishmentTimeDays: { toNumber(): number } | null };

/** Maps a stored Approved Recommendation to the rule's input (null when it carries no approval data). */
export function toApproval(row: ApprovedRow | null) {
  if (!row?.approvalReferenceDate || !row.replenishmentTimeDays) return null;
  return { approvalReferenceDate: iso(row.approvalReferenceDate), replenishmentTimeDays: row.replenishmentTimeDays.toNumber() };
}

/**
 * What to store when a Replenish Recommendation is Approved: the Approval Reference Date (the Reference Date in
 * force now) and the Replenishment Time used (Indicator Snapshot at Submit, else the Item's current one).
 */
export async function approvalData(
  prisma: PrismaClient,
  itemId: number,
  snapshot: unknown,
): Promise<{ approvalReferenceDate: Date | null; replenishmentTimeDays: number | null }> {
  const computed = await computeFromDatabase(prisma);
  const fromSnapshot = (snapshot as { indicators?: { replenishmentTimeDays?: number | null } | null } | null)?.indicators
    ?.replenishmentTimeDays;
  const current = computed.result?.items.find((i) => i.itemId === itemId)?.replenishmentTimeDays ?? null;
  return {
    approvalReferenceDate: computed.referenceDate ? new Date(`${computed.referenceDate}T00:00:00Z`) : null,
    replenishmentTimeDays: fromSnapshot ?? current,
  };
}

/**
 * EXTENSION POINT used by Reminders (ticket 13), filled in by ticket 17: true when the Item has a Replenishment in
 * Progress (rule in ./replenishment-rule), measured on `referenceDate` (ISO yyyy-mm-dd, or null when no data is
 * loaded) with the Item's current Urgency. Reminders skip such Items.
 */
export async function hasReplenishmentInProgress(
  prisma: PrismaClient,
  itemId: number,
  referenceDate: string | null,
): Promise<boolean> {
  const row = await latestApprovedReplenishment(prisma, itemId);
  if (!row) return false;
  const computed = await computeFromDatabase(prisma);
  const urgencyLevel = computed.result?.items.find((i) => i.itemId === itemId)?.urgencyLevel ?? null;
  return replenishmentStatus({ approval: toApproval(row), referenceDate, urgencyLevel }).inProgress;
}

/** Replenishment status per Recommendation id, for the API: only the Item's latest Approved Replenish has any. */
export async function replenishmentStatuses(
  prisma: PrismaClient,
  rows: readonly { id: number; itemId: number; type: string; status: string }[],
): Promise<Map<number, ReplenishmentStatus>> {
  const out = new Map<number, ReplenishmentStatus>();
  const candidates = rows.filter((r) => r.type === 'REPLENISH' && r.status === 'APPROVED');
  if (candidates.length === 0) return out;
  const computed = await computeFromDatabase(prisma);
  for (const itemId of new Set(candidates.map((r) => r.itemId))) {
    const latest = await latestApprovedReplenishment(prisma, itemId);
    if (!latest) continue;
    const urgencyLevel = computed.result?.items.find((i) => i.itemId === itemId)?.urgencyLevel ?? null;
    out.set(latest.id, replenishmentStatus({ approval: toApproval(latest), referenceDate: computed.referenceDate, urgencyLevel }));
  }
  return out;
}
