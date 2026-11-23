import type { PrismaClient } from '../generated/prisma/client';

/**
 * EXTENSION POINT for ticket 17 (Replenishment in Progress).
 * Returns true when the Item has an Approved Replenish Recommendation whose expected delivery date has not
 * passed (measured on `referenceDate`, ISO yyyy-mm-dd, or null when no data is loaded). Reminders skip such Items.
 * Ticket 13 ships it returning false; ticket 17 replaces the body and keeps the signature.
 */
export async function hasReplenishmentInProgress(
  _prisma: PrismaClient,
  _itemId: number,
  _referenceDate: string | null,
): Promise<boolean> {
  return false;
}
