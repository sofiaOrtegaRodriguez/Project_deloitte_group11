// PDF report (ticket 23): the view's filters, Reference Date, KPIs, urgency ranking and Recommendations as tables.
// `buildReportDefinition` is pure (no I/O) so tests assert on the document content without parsing PDF bytes.
import * as path from 'node:path';
import pdfmake from 'pdfmake';
import type { RankingRow } from '../planning/planning.module';
import type { Cell, ViewData, ViewKpi } from './view-data';

export const REPORT_TITLE = 'Hosstock — Procurement report';

type Row = string[];

const words = (v: string) => v.charAt(0) + v.slice(1).toLowerCase().replaceAll('_', ' ');
const text = (c: Cell | undefined) => (c === null || c === undefined ? '—' : typeof c === 'number' ? String(Number(c.toFixed(2))) : c);
const period = (p: ViewData['period']) => (p ? `${p.start} to ${p.end}` : 'none');
const signed = (n: number) => `${n > 0 ? '+' : ''}${text(n)}`;

function table(headers: string[], rows: Row[], widths: (string | number)[]) {
  const head = headers.map((h) => ({ text: h, bold: true, fillColor: '#eeeeee' }));
  return {
    table: { headerRows: 1, widths, body: [head, ...rows] },
    layout: 'lightHorizontalLines',
    fontSize: 8,
    marginBottom: 12,
  };
}

function kpiRow(k: ViewKpi): Row {
  const delta = k.deltaAbsolute === null ? '—' : `${signed(k.deltaAbsolute)}${k.deltaPct === null ? '' : ` (${signed(k.deltaPct)}%)`}`;
  return [k.label, k.unit, text(k.value), text(k.previous), delta];
}

const heading = (title: string, extra: object = {}) => ({ text: title, fontSize: 12, bold: true, marginBottom: 4, ...extra });

/** The pdfmake document definition. `ranking` must already be restricted to the filtered Items, in ranking order. */
export function buildReportDefinition(data: ViewData, ranking: RankingRow[]) {
  const recs = data.recommendations;
  const col = (name: string) => recs.columns.findIndex((c) => c.header === name);
  const recCols = ['Type', 'Status', 'Item', 'Quantity', 'Estimated Cost', 'Justification'].map(col);
  const short = (s: string) => (s.length > 140 ? `${s.slice(0, 137)}...` : s);

  return {
    info: { title: REPORT_TITLE, creator: 'Hosstock' },
    pageSize: 'A4',
    pageOrientation: 'landscape',
    pageMargins: [30, 30, 30, 30],
    defaultStyle: { font: 'Roboto', fontSize: 9 },
    content: [
      { text: REPORT_TITLE, fontSize: 18, bold: true, marginBottom: 6 },
      { text: `Reference Date: ${data.referenceDate ?? 'none'}` },
      { text: `Period: ${period(data.period)}` },
      { text: `Previous period: ${period(data.previousPeriod)}` },
      heading('Filters', { marginTop: 10 }),
      data.filters.length ? { ul: data.filters.map((f) => `${f.label}: ${f.value}`) } : { text: 'Filters: none' },
      heading('KPIs', { marginTop: 10 }),
      table(['KPI', 'Unit', 'Value', 'Previous period', 'Change'], data.kpis.map(kpiRow), ['*', 70, 80, 90, 120]),
      heading('Urgency ranking'),
      ranking.length
        ? table(
            ['#', 'Item', 'Category', 'Urgency Level', 'Priority Score', 'Reasons'],
            ranking.map((r, i) => [String(i + 1), r.name, r.category, words(r.urgencyLevel), text(r.priorityScore), r.reasons.join('; ')]),
            [20, 130, 80, 60, 50, '*'],
          )
        : { text: 'No Items.', marginBottom: 12 },
      heading('Recommendations'),
      recs.rows.length
        ? table(
            ['Type', 'Status', 'Item', 'Quantity', 'Estimated Cost', 'Justification'],
            recs.rows.map((r) => recCols.map((i, n) => (n === 5 ? short(text(r[i])) : text(r[i])))),
            [70, 60, 130, 45, 60, '*'],
          )
        : { text: 'No Recommendations.' },
    ],
  };
}

export type ReportDefinition = ReturnType<typeof buildReportDefinition>;

/** Every string in a document definition, in order (for content assertions). */
export function definitionTexts(node: unknown): string[] {
  if (typeof node === 'string') return [node];
  if (Array.isArray(node)) return node.flatMap(definitionTexts);
  if (node && typeof node === 'object') return Object.values(node).flatMap(definitionTexts);
  return [];
}

let configured = false;
/** Renders a document definition to PDF bytes with the Roboto fonts bundled in the pdfmake package (no network). */
export async function renderPdf(definition: object): Promise<Buffer> {
  if (!configured) {
    const dir = path.join(path.dirname(require.resolve('pdfmake/package.json')), 'fonts', 'Roboto');
    pdfmake.setFonts({
      Roboto: {
        normal: path.join(dir, 'Roboto-Regular.ttf'),
        bold: path.join(dir, 'Roboto-Medium.ttf'),
        italics: path.join(dir, 'Roboto-Italic.ttf'),
        bolditalics: path.join(dir, 'Roboto-MediumItalic.ttf'),
      },
    });
    configured = true;
  }
  return pdfmake.createPdf(definition).getBuffer();
}
