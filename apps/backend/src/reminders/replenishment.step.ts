// Recalculation step "replenishment" (ticket 17): when the expected delivery date has passed (Reference Date after it)
// and the Item is still Critical or Attention, the Item's open Alert Reopens (back to New) with the reason
// "expected delivery overdue", ONCE per Recommendation (`overdueReopenedAt`), so later recalculations and Simulation
// steps do not reopen it again. The Alert is reopened from any open status: Acknowledged/Resolved/Ignored/Viewed
// mean "handled or seen", and an overdue delivery means that is no longer true. After that, Reminders resume normally.
import { reopen } from '../alerts/alerts';
import { requireIndicators, type RecalculationStep } from '../recalculation/recalculation';
import { latestApprovedReplenishment, toApproval } from './replenishment';
import { replenishmentStatus } from './replenishment-rule';

export const OVERDUE_REASON = 'expected delivery overdue';

export const replenishmentStep: RecalculationStep = {
  name: 'replenishment',
  async run(context) {
    const { result, referenceDate } = requireIndicators(context);
    if (!result) return;
    const { prisma } = context;
    for (const item of result.items) {
      if (item.urgencyLevel !== 'CRITICAL' && item.urgencyLevel !== 'ATTENTION') continue;
      const approved = await latestApprovedReplenishment(prisma, item.itemId);
      if (!approved || approved.overdueReopenedAt) continue;
      const status = replenishmentStatus({ approval: toApproval(approved), referenceDate, urgencyLevel: item.urgencyLevel });
      if (!status.overdue) continue;
      const alert = await prisma.alert.findFirst({ where: { itemId: item.itemId, status: { not: 'CLEARED' } } });
      if (!alert) continue;
      // The marker is claimed first, so two concurrent runs cannot both reopen.
      const claimed = await prisma.recommendation.updateMany({
        where: { id: approved.id, overdueReopenedAt: null },
        data: { overdueReopenedAt: new Date() },
      });
      if (claimed.count === 0) continue;
      await reopen(prisma, alert.id, OVERDUE_REASON);
    }
  },
};
