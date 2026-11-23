import type { PrismaClient } from '../generated/prisma/client';
import { Recalculation, type RecalculationContext } from './recalculation';
import { recalculationSteps } from './steps';

/** Runs the full recalculation with every registered step. Used by the ETL, and by the app when settings change. */
export function runRecalculation(prisma: PrismaClient): Promise<RecalculationContext> {
  return new Recalculation(prisma, recalculationSteps).run();
}
