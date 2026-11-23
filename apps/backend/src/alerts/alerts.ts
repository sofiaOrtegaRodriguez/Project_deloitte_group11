// Alert lifecycle rules (ADR 0004). Everything here needs only a Prisma client, so the recalculation
// step (which runs without Nest) and the HTTP service share it. Other tickets call the exported
// functions through AlertsService: Reminders (13), Recommendation-driven status changes (15), Reopening (17).
import type { AlertLevel, AlertStatus, PrismaClient } from '../generated/prisma/client';
import type { ItemIndicators } from '../indicators/types';

/** The statuses a person can choose by hand. NEW and CLEARED are only set by the system. */
export const MANUAL_STATUSES = ['VIEWED', 'ACKNOWLEDGED', 'IGNORED', 'RESOLVED'] as const satisfies readonly AlertStatus[];
export type ManualStatus = (typeof MANUAL_STATUSES)[number];

export class AlertNotFoundError extends Error {}
export class AlertClosedError extends Error {}

/** What one recalculation changed, mostly for tests and logs. */
export interface AlertSyncSummary {
  created: number;
  escalated: number;
  cleared: number;
}

/**
 * Brings Alerts in line with the Items' Urgency Levels:
 * - Critical/Attention with no open Alert: create one (New);
 * - Attention -> Critical on an open Alert: raise the level and return it to New (Escalation);
 * - Critical -> Attention: lower the level, status unchanged;
 * - Normal (or no Item State) with an open Alert: Cleared. A new Alert is only possible after that.
 */
export async function syncAlerts(prisma: PrismaClient, items: readonly ItemIndicators[]): Promise<AlertSyncSummary> {
  const summary: AlertSyncSummary = { created: 0, escalated: 0, cleared: 0 };
  const open = await prisma.alert.findMany({ where: { status: { not: 'CLEARED' } } });
  const openByItem = new Map(open.map((a) => [a.itemId, a]));
  const seen = new Set<number>();

  for (const item of items) {
    seen.add(item.itemId);
    const level: AlertLevel | null =
      item.urgencyLevel === 'CRITICAL' ? 'CRITICAL' : item.urgencyLevel === 'ATTENTION' ? 'ATTENTION' : null;
    const alert = openByItem.get(item.itemId);

    if (!alert) {
      if (!level) continue;
      await prisma.alert.create({
        data: {
          itemId: item.itemId,
          level,
          status: 'NEW',
          priorityScore: item.priorityScore,
          events: { create: { type: 'CREATED', toStatus: 'NEW', toLevel: level } },
        },
      });
      summary.created++;
    } else if (!level) {
      await clear(prisma, alert.id, alert.status);
      summary.cleared++;
    } else if (alert.level === 'ATTENTION' && level === 'CRITICAL') {
      await prisma.alert.update({
        where: { id: alert.id },
        data: {
          level,
          status: 'NEW',
          reason: null,
          priorityScore: item.priorityScore,
          events: {
            create: { type: 'ESCALATED', fromStatus: alert.status, toStatus: 'NEW', fromLevel: alert.level, toLevel: level },
          },
        },
      });
      summary.escalated++;
    } else if (alert.level === 'CRITICAL' && level === 'ATTENTION') {
      await prisma.alert.update({
        where: { id: alert.id },
        data: {
          level,
          priorityScore: item.priorityScore,
          events: { create: { type: 'LEVEL_LOWERED', fromLevel: alert.level, toLevel: level } },
        },
      });
    } else if (alert.priorityScore !== item.priorityScore) {
      await prisma.alert.update({ where: { id: alert.id }, data: { priorityScore: item.priorityScore } });
    }
  }

  // An open Alert whose Item has disappeared from the indicators has nothing left to warn about.
  for (const alert of open) {
    if (!seen.has(alert.itemId)) {
      await clear(prisma, alert.id, alert.status);
      summary.cleared++;
    }
  }
  return summary;
}

function clear(prisma: PrismaClient, alertId: number, from: AlertStatus) {
  return prisma.alert.update({
    where: { id: alertId },
    data: { status: 'CLEARED', events: { create: { type: 'CLEARED', fromStatus: from, toStatus: 'CLEARED' } } },
  });
}

async function requireAlert(prisma: PrismaClient, alertId: number) {
  const alert = await prisma.alert.findUnique({ where: { id: alertId } });
  if (!alert) throw new AlertNotFoundError(`Alert ${alertId} not found`);
  return alert;
}

async function requireOpenAlert(prisma: PrismaClient, alertId: number) {
  const alert = await requireAlert(prisma, alertId);
  if (alert.status === 'CLEARED') throw new AlertClosedError('This Alert is Cleared and can no longer change.');
  return alert;
}

/**
 * Changes an open Alert's status and logs it. `userId` null means "system"; `note` is free context such as
 * "via Recommendation #4". A Cleared Alert is closed and cannot change.
 */
export async function changeStatus(
  prisma: PrismaClient,
  alertId: number,
  status: ManualStatus,
  actor: { userId: number | null; note?: string | null },
) {
  const alert = await requireOpenAlert(prisma, alertId);
  return prisma.alert.update({
    where: { id: alertId },
    data: {
      status,
      events: {
        create: { type: 'STATUS_CHANGED', fromStatus: alert.status, toStatus: status, userId: actor.userId, note: actor.note ?? null },
      },
    },
  });
}

/** Reopening: the same Alert returns to New, with the reason recorded (ADR 0004). Used by Reminders and overdue deliveries. */
export async function reopen(prisma: PrismaClient, alertId: number, reason: string) {
  const alert = await requireOpenAlert(prisma, alertId);
  return prisma.alert.update({
    where: { id: alertId },
    data: {
      status: 'NEW',
      reason,
      events: { create: { type: 'REOPENED', fromStatus: alert.status, toStatus: 'NEW', userId: null, note: reason } },
    },
  });
}

/** Comments are allowed in any status, Cleared included. */
export async function addComment(prisma: PrismaClient, alertId: number, userId: number, comment: string) {
  await requireAlert(prisma, alertId);
  return prisma.alertEvent.create({ data: { alertId, type: 'COMMENTED', userId, comment } });
}
