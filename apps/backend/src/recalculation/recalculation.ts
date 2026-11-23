// The recalculation operation (spec "Recalculation"): an ordered list of steps run one after another.
// Later tickets add their step (Alert sync, auto-Drafts, Stale Draft detection) by writing a
// `RecalculationStep` and adding one line to `recalculationSteps` in steps.ts; none of them edits
// the runner. The runner only needs a Prisma client, so the ETL command can use it without Nest.
import type { PrismaClient } from '../generated/prisma/client';
import type { ComputedIndicators } from '../indicators/load-indicators';

/** Shared by all steps of one run. Earlier steps fill fields that later steps read. */
export interface RecalculationContext {
  prisma: PrismaClient;
  /** Filled by the "indicators" step: Item States, indicators and classification as of the Reference Date. */
  indicators?: ComputedIndicators;
}

export interface RecalculationStep {
  /** Unique, for logs and error messages. */
  name: string;
  run(context: RecalculationContext): Promise<void>;
}

/** The indicators computed by the first step. Throws when a step is registered before it. */
export function requireIndicators(context: RecalculationContext): ComputedIndicators {
  if (!context.indicators) {
    throw new Error('Recalculation step order is wrong: the "indicators" step must run first.');
  }
  return context.indicators;
}

export class Recalculation {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly steps: readonly RecalculationStep[],
  ) {}

  /** Runs every step in order. A failing step stops the run and the error names the step. */
  async run(): Promise<RecalculationContext> {
    const context: RecalculationContext = { prisma: this.prisma };
    for (const step of this.steps) {
      try {
        await step.run(context);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Recalculation failed in step "${step.name}": ${message}`, { cause: error });
      }
    }
    return context;
  }
}
