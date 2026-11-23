// The recalculation runner: steps run in order, share a context, and failures name the step.
import type { PrismaClient } from '../generated/prisma/client';
import { Recalculation, requireIndicators, type RecalculationStep } from './recalculation';

const prisma = {} as PrismaClient; // the runner never touches it; these steps do not either

describe('Recalculation', () => {
  it('runs the steps in list order', async () => {
    const calls: string[] = [];
    const step = (name: string): RecalculationStep => ({
      name,
      run: async () => {
        calls.push(name);
      },
    });
    await new Recalculation(prisma, [step('indicators'), step('alerts'), step('drafts')]).run();
    expect(calls).toEqual(['indicators', 'alerts', 'drafts']);
  });

  it('lets a later step read what an earlier one put in the context', async () => {
    const first: RecalculationStep = {
      name: 'first',
      run: async (ctx) => {
        ctx.indicators = { referenceDate: '2025-01-01', result: null } as never;
      },
    };
    let seen: string | null | undefined;
    const second: RecalculationStep = {
      name: 'second',
      run: async (ctx) => {
        seen = requireIndicators(ctx).referenceDate;
      },
    };
    await new Recalculation(prisma, [first, second]).run();
    expect(seen).toBe('2025-01-01');
  });

  it('stops at a failing step and names it', async () => {
    const calls: string[] = [];
    const steps: RecalculationStep[] = [
      { name: 'a', run: async () => void calls.push('a') },
      {
        name: 'b',
        run: async () => {
          throw new Error('boom');
        },
      },
      { name: 'c', run: async () => void calls.push('c') },
    ];
    await expect(new Recalculation(prisma, steps).run()).rejects.toThrow('Recalculation failed in step "b": boom');
    expect(calls).toEqual(['a']);
  });

  it('requireIndicators explains a wrong step order', () => {
    expect(() => requireIndicators({ prisma })).toThrow('"indicators" step must run first');
  });
});
