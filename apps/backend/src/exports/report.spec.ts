import { buildReportDefinition, definitionTexts } from './report';
import type { ViewData } from './view-data';
import type { RankingRow } from '../planning/planning.module';

const kpi = (key: string, label: string, value: number) => ({
  key,
  label,
  unit: 'items',
  value,
  previous: value - 1,
  deltaAbsolute: 1,
  deltaPct: 10,
});

const data = {
  referenceDate: '2025-01-10',
  period: { start: '2024-12-12', end: '2025-01-10' },
  previousPeriod: { start: '2024-11-12', end: '2024-12-11' },
  filters: [{ label: 'Urgency Level', value: 'Critical' }],
  kpis: ['Stock Value', 'Excess Stock Value', 'Inventory Availability', 'Items Below Minimum', 'Median Stock Autonomy', 'Weighted Stock Turnover', 'Mean Replenishment Time'].map(
    (l, i) => kpi(`k${i}`, l, i + 5),
  ),
  inventory: { name: 'Inventory', columns: [], rows: [] },
  topItems: { name: 'Top Items', columns: [], rows: [] },
  recommendations: {
    name: 'Recommendations',
    columns: ['Type', 'Status', 'Item', 'Quantity', 'Estimated Cost', 'Justification'].map((header) => ({ header, type: 'text' as const })),
    rows: [['Replenish', 'Draft', 'Monitor', 10, 250, 'Below minimum']],
  },
} as unknown as ViewData;

const ranking = [
  { rank: 1, name: 'Monitor', category: 'Equipment', urgencyLevel: 'CRITICAL', priorityScore: 8.5, reasons: ['Below minimum', 'Long lead time'] },
] as unknown as RankingRow[];

describe('buildReportDefinition', () => {
  const texts = definitionTexts(buildReportDefinition(data, ranking));

  it('states title, Reference Date, periods and filters', () => {
    expect(texts).toContain('Hosstock — Procurement report');
    expect(texts).toContain('Reference Date: 2025-01-10');
    expect(texts).toContain('Period: 2024-12-12 to 2025-01-10');
    expect(texts).toContain('Previous period: 2024-11-12 to 2024-12-11');
    expect(texts).toContain('Urgency Level: Critical');
  });

  it('says "none" without filters', () => {
    expect(definitionTexts(buildReportDefinition({ ...data, filters: [] }, ranking))).toContain('Filters: none');
  });

  it('lists the 7 KPIs, the ranking with reasons and the Recommendations', () => {
    for (const l of ['Stock Value', 'Items Below Minimum', 'Mean Replenishment Time']) expect(texts).toContain(l);
    expect(texts).toContain('Monitor');
    expect(texts).toContain('Below minimum; Long lead time');
    expect(texts).toContain('Replenish');
    expect(texts).toContain('250');
    expect(texts).not.toContain('Syringe');
  });
});
