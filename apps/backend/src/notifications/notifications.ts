// Notification writing (ADR 0004: Alerts are team-wide, so Alert events notify every Active User).
// Needs only a Prisma client (or transaction), so the CLI ETL's alerts step, which runs without Nest, can use it.
import type { NotificationType, PrismaClient } from '../generated/prisma/client';

type Db = Pick<PrismaClient, 'user' | 'notification'>;

export interface NotificationContent {
  type: NotificationType;
  message: string;
  alertId?: number | null;
  itemId?: number | null;
  recommendationId?: number | null;
}

const toRow = (userId: number, content: NotificationContent) => ({
  userId,
  type: content.type,
  message: content.message,
  alertId: content.alertId ?? null,
  itemId: content.itemId ?? null,
  recommendationId: content.recommendationId ?? null,
});

/** Notifies one User. */
export async function notifyUser(db: Db, userId: number, content: NotificationContent): Promise<void> {
  await db.notification.create({ data: toRow(userId, content) });
}

/** Notifies every Active User (Pending, Rejected and Removed Users get nothing). Returns how many were notified. */
export async function notifyAllActiveUsers(db: Db, content: NotificationContent): Promise<number> {
  const users = await db.user.findMany({ where: { status: 'ACTIVE' }, select: { id: true } });
  if (users.length === 0) return 0;
  const result = await db.notification.createMany({ data: users.map((u) => toRow(u.id, content)) });
  return result.count;
}

export const alertCreatedMessage = (itemName: string, level: string) => `New ${level.toLowerCase()} alert: ${itemName}`;
export const alertEscalatedMessage = (itemName: string) => `Alert escalated to critical: ${itemName}`;
export const alertReopenedMessage = (itemName: string, reason: string) => `Alert reopened: ${itemName} (${reason})`;
