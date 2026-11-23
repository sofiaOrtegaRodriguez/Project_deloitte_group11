// THE ordered list of recalculation steps. To add a step, create it in its own file and add one line here.
// Order matters: a step may read what earlier steps put in the context.
import { alertsStep } from '../alerts/alerts.step';
import { computeFromDatabase } from '../indicators/load-indicators';
import { autoDraftsStep } from '../recommendations/auto-drafts-step';
import { staleDraftsStep } from '../recommendations/stale-drafts';
import type { RecalculationStep } from './recalculation';

/** Step 1: Item States -> indicators -> classification, as of the Reference Date. */
export const indicatorsStep: RecalculationStep = {
  name: 'indicators',
  async run(context) {
    context.indicators = await computeFromDatabase(context.prisma);
  },
};

export const recalculationSteps: readonly RecalculationStep[] = [
  indicatorsStep,
  alertsStep,
  autoDraftsStep,
  staleDraftsStep, // must stay LAST: compares Drafts with what the earlier steps settled
  // Later tickets: Alert synchronisation, auto-Draft synchronisation, Stale Draft detection.
];
