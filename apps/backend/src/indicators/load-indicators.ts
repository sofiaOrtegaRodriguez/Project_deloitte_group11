// The only place that connects the pure indicators module to the database: it reads Snapshots,
// Threshold Overrides and the global settings, and hands them to `computeIndicators`.
import type { PrismaClient } from '../generated/prisma/client';
import { computeIndicators } from './indicators';
import type { AbcClass, IndicatorConfig, IndicatorsResult, ItemInput, Period } from './types';
import { DEFAULT_INDICATOR_CONFIG } from './types';

export interface Settings {
  /** Null means "the last date in the dataset". */
  referenceDate: string | null;
  config: IndicatorConfig;
}

const toIso = (date: Date): string => date.toISOString().slice(0, 10);
const ABC_CLASSES: readonly string[] = ['A', 'B', 'C'];

/** Global settings; the defaults apply when nothing has been saved yet. */
export async function loadSettings(prisma: PrismaClient): Promise<Settings> {
  const row = await prisma.settings.findUnique({ where: { id: 1 } });
  if (!row) return { referenceDate: null, config: { ...DEFAULT_INDICATOR_CONFIG } };
  return {
    referenceDate: row.referenceDate ? toIso(row.referenceDate) : null,
    config: {
      abcThresholdA: row.abcThresholdA,
      abcThresholdB: row.abcThresholdB,
      urgencyFactor: row.urgencyFactor,
      criticalAbcClasses: row.criticalAbcClasses.filter((c): c is AbcClass => ABC_CLASSES.includes(c)),
      lowTurnoverThreshold: row.lowTurnoverThreshold,
    },
  };
}

export interface IndicatorInputs {
  items: ItemInput[];
  /** First and last Snapshot date of the whole dataset. Null when there are no Snapshots. */
  datasetRange: Period | null;
  settings: Settings;
  /** The Reference Date in force: the setting, or the dataset's last date. Null when there is no data. */
  referenceDate: string | null;
}

export async function loadIndicatorInputs(prisma: PrismaClient): Promise<IndicatorInputs> {
  const [items, settings, range] = await Promise.all([
    prisma.item.findMany({
      orderBy: { id: 'asc' },
      include: {
        thresholdOverride: true,
        snapshots: {
          orderBy: [{ date: 'asc' }, { id: 'asc' }],
          select: {
            date: true,
            currentStock: true,
            minRequired: true,
            maxCapacity: true,
            unitCost: true,
            avgUsagePerDay: true,
            replenishmentTimeDays: true,
          },
        },
      },
    }),
    loadSettings(prisma),
    prisma.snapshot.aggregate({ _min: { date: true }, _max: { date: true } }),
  ]);

  const datasetRange =
    range._min.date && range._max.date ? { start: toIso(range._min.date), end: toIso(range._max.date) } : null;
  const referenceDate = settings.referenceDate ?? datasetRange?.end ?? null;

  return {
    items: items.map(
      (item): ItemInput => ({
        itemId: item.id,
        thresholdOverride: item.thresholdOverride
          ? {
              minRequired: item.thresholdOverride.minRequired?.toNumber() ?? null,
              maxCapacity: item.thresholdOverride.maxCapacity?.toNumber() ?? null,
            }
          : null,
        snapshots: item.snapshots.map((s) => ({
          date: toIso(s.date),
          currentStock: s.currentStock.toNumber(),
          minRequired: s.minRequired.toNumber(),
          maxCapacity: s.maxCapacity.toNumber(),
          unitCost: s.unitCost.toNumber(),
          avgUsagePerDay: s.avgUsagePerDay.toNumber(),
          replenishmentTimeDays: s.replenishmentTimeDays.toNumber(),
        })),
      }),
    ),
    datasetRange,
    settings,
    referenceDate,
  };
}

export interface ComputedIndicators {
  referenceDate: string | null;
  config: IndicatorConfig;
  result: IndicatorsResult | null;
}

/**
 * Indicators as of the Reference Date. The period runs from `from` (default: the first date of the
 * dataset) to `to` (default: the Reference Date).
 */
export async function computeFromDatabase(
  prisma: PrismaClient,
  options: { from?: string; to?: string } = {},
): Promise<ComputedIndicators> {
  const inputs = await loadIndicatorInputs(prisma);
  const end = options.to ?? inputs.referenceDate;
  if (!end || !inputs.datasetRange) {
    return { referenceDate: inputs.referenceDate, config: inputs.settings.config, result: null };
  }
  const start = options.from ?? (inputs.datasetRange.start < end ? inputs.datasetRange.start : end);
  const result = computeIndicators(inputs.items, { start, end }, inputs.settings.config);
  return { referenceDate: inputs.referenceDate, config: inputs.settings.config, result };
}
