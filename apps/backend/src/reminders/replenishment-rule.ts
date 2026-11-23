// The Replenishment in Progress rule (spec "Alerts: Replenishment in Progress", ticket 17), pure so it is unit-tested.
//
// Definitions:
// - Approval Reference Date: the Reference Date in force when the Replenish Recommendation was Approved
//   (NOT the real approval instant: a Simulation may have moved the Reference Date).
// - Replenishment Time used: the Item's Replenishment Time (days) in the Indicator Snapshot taken at Submit, falling
//   back to the Item's current one. Fractions round UP to whole days.
// - Expected delivery date = Approval Reference Date + ceil(Replenishment Time) days. Always measured on the Reference Date.
// - IN PROGRESS: there is an Approved Replenish Recommendation (the Item's latest), the Item is Critical or
//   Attention, and the Reference Date has not passed the expected delivery date (the delivery day itself still counts).
// - ENDS at whichever comes first: the Item returns to Normal, or the Reference Date passes the expected delivery date.
// - OVERDUE: the Reference Date is after the expected delivery date (the Alert Reopening is in ./replenishment.step).
import type { UrgencyLevel } from '../indicators/types';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Adds whole days to an ISO date (yyyy-mm-dd), in UTC so daylight saving never shifts it. */
function addDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Approval Reference Date + Replenishment Time rounded up to whole days (never negative). */
export function expectedDeliveryDate(approvalReferenceDate: string, replenishmentTimeDays: number): string {
  return addDays(approvalReferenceDate, Math.max(0, Math.ceil(replenishmentTimeDays)));
}

export interface ReplenishmentInput {
  /** The Item's latest Approved Replenish Recommendation: null when there is none. */
  approval: { approvalReferenceDate: string; replenishmentTimeDays: number } | null;
  /** The Reference Date in force; null when no data is loaded. */
  referenceDate: string | null;
  urgencyLevel: UrgencyLevel | null;
}

export interface ReplenishmentStatus {
  inProgress: boolean;
  expectedDeliveryDate: string | null;
  /** The Reference Date has passed the expected delivery date (whatever the Item's Urgency). */
  overdue: boolean;
}

export function replenishmentStatus(input: ReplenishmentInput): ReplenishmentStatus {
  if (!input.approval) return { inProgress: false, expectedDeliveryDate: null, overdue: false };
  const expected = expectedDeliveryDate(input.approval.approvalReferenceDate, input.approval.replenishmentTimeDays);
  if (!input.referenceDate) return { inProgress: false, expectedDeliveryDate: expected, overdue: false };
  // ISO dates compare correctly as strings.
  const overdue = input.referenceDate > expected;
  const atRisk = input.urgencyLevel === 'CRITICAL' || input.urgencyLevel === 'ATTENTION';
  return { inProgress: atRisk && !overdue, expectedDeliveryDate: expected, overdue };
}
