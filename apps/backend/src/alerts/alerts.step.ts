import { requireIndicators, type RecalculationStep } from '../recalculation/recalculation';
import { syncAlerts } from './alerts';

/** Recalculation step: synchronises Alerts with the Urgency Levels computed by the "indicators" step. */
export const alertsStep: RecalculationStep = {
  name: 'alerts',
  async run(context) {
    const { result } = requireIndicators(context);
    if (!result) return; // no data loaded yet: nothing to warn about, and nothing to clear
    await syncAlerts(context.prisma, result.items);
  },
};
