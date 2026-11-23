// Recalculation step "auto-drafts": Replenish Drafts for Critical/Attention Items, Hold Purchases Drafts
// for Items with Excess Stock or low turnover. Never a second open Draft per Item and type.
import { requireIndicators, type RecalculationStep } from '../recalculation/recalculation';
import { createRecommendation, EMPTY_HISTORY, loadHistory } from './create-recommendation';
import { autoDraftTypes } from './recommendation-logic';

export const autoDraftsStep: RecalculationStep = {
  name: 'auto-drafts',
  async run(context) {
    const { referenceDate, result } = requireIndicators(context);
    if (!result) return;
    const { prisma } = context;

    const wanted = result.items
      .map((indicators) => ({ indicators, types: autoDraftTypes(indicators) }))
      .filter((w) => w.types.length > 0);
    if (wanted.length === 0) return;

    const itemIds = wanted.map((w) => w.indicators.itemId);
    const open = await prisma.recommendation.findMany({
      where: { status: 'DRAFT', itemId: { in: itemIds } },
      select: { itemId: true, type: true },
    });
    const openKeys = new Set(open.map((r) => `${r.itemId}:${r.type}`));
    const history = await loadHistory(prisma, itemIds);

    for (const { indicators, types } of wanted) {
      for (const type of types) {
        if (openKeys.has(`${indicators.itemId}:${type}`)) continue;
        await createRecommendation(prisma, {
          indicators,
          type,
          referenceDate,
          history: history.get(indicators.itemId) ?? EMPTY_HISTORY,
          createdById: null,
        });
      }
    }
  },
};
