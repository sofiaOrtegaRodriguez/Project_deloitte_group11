import { Controller, Get, Module, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import ExcelJS from 'exceljs';
import { DashboardService } from '../dashboard/dashboard.module';
import { FilterQuery } from '../filters/filters';
import { ItemsService } from '../items/items.module';
import { RecommendationsService } from '../recommendations/recommendations.service';
import { ViewDataService, type Cell, type ViewData, type ViewTable } from './view-data';

/** A CSV field: quoted when it holds a comma, quote, CR or LF; quotes doubled. Numbers use "." and no grouping. */
function csvField(cell: Cell): string {
  if (cell === null) return '';
  const text = typeof cell === 'number' ? String(Number(cell.toFixed(4))) : cell;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/**
 * CSV layout: a UTF-8 BOM (so Excel reads accents), then metadata as comment lines starting with "# " (Reference
 * Date, period and filters), then the header row and the data rows, CRLF separated. Parsers skip the metadata with
 * `comment='#'` (pandas) or by dropping leading "#" lines; the data block itself is plain RFC 4180.
 */
export function toCsv(data: ViewData, table: ViewTable): string {
  const meta = [
    'Hosstock export',
    `Reference Date: ${data.referenceDate ?? 'none'}`,
    `Period: ${data.period ? `${data.period.start} to ${data.period.end}` : 'none'}`,
    ...(data.filters.length ? data.filters.map((f) => `Filter ${f.label}: ${f.value}`) : ['Filters: none']),
  ].map((line) => `# ${line.replace(/[\r\n]+/g, ' ')}`);
  const lines = [...meta, table.columns.map((c) => csvField(c.header)).join(','), ...table.rows.map((r) => r.map(csvField).join(','))];
  return '﻿' + lines.join('\r\n') + '\r\n';
}

const bold = { bold: true };

function addTable(sheet: ExcelJS.Worksheet, table: ViewTable) {
  sheet.addRow(table.columns.map((c) => c.header)).font = bold;
  for (const row of table.rows) sheet.addRow(row);
  table.columns.forEach((c, i) => {
    sheet.getColumn(i + 1).width = Math.max(12, Math.min(50, c.header.length + 2));
  });
}

/** Header block on every sheet: title, Reference Date, period, filters; then a blank row. */
function addMetadata(sheet: ExcelJS.Worksheet, data: ViewData, title: string) {
  sheet.addRow([title]).font = { bold: true, size: 14 };
  sheet.addRow(['Reference Date', data.referenceDate ?? 'none']);
  sheet.addRow(['Period', data.period ? `${data.period.start} to ${data.period.end}` : 'none']);
  if (data.filters.length === 0) sheet.addRow(['Filters', 'none']);
  else data.filters.forEach((f, i) => sheet.addRow([i === 0 ? 'Filters' : '', `${f.label}: ${f.value}`]));
  sheet.addRow([]);
}

export async function toWorkbook(data: ViewData): Promise<ExcelJS.Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Hosstock';

  const kpi = wb.addWorksheet('KPIs');
  addMetadata(kpi, data, 'Hosstock KPIs');
  kpi.addRow(['KPI', 'Unit', 'Value', 'Previous period', 'Change', 'Change %']).font = bold;
  for (const k of data.kpis) kpi.addRow([k.label, k.unit, k.value, k.previous, k.deltaAbsolute, k.deltaPct]);
  [28, 12, 16, 16, 14, 12].forEach((w, i) => {
    kpi.getColumn(i + 1).width = w;
  });

  for (const table of [data.inventory, data.topItems, data.recommendations]) {
    const sheet = wb.addWorksheet(table.name);
    addMetadata(sheet, data, table.name);
    addTable(sheet, table);
  }
  return wb.xlsx.writeBuffer();
}

@Controller('exports')
export class ExportsController {
  constructor(private readonly views: ViewDataService) {}

  /** The Inventory table of the slice. Same query parameters as /api/items. Requires login (global guard). */
  @Get('inventory.csv')
  async inventoryCsv(@Query() query: FilterQuery, @Res() res: Response): Promise<void> {
    const data = await this.views.assemble(query);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="hosstock-inventory-${data.referenceDate ?? 'empty'}.csv"`);
    res.send(toCsv(data, data.inventory));
  }

  /** The whole view as Excel: a KPI sheet plus one sheet per table. Same query parameters as /api/dashboard. */
  @Get('view.xlsx')
  async viewXlsx(@Query() query: FilterQuery, @Res() res: Response): Promise<void> {
    const data = await this.views.assemble(query);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="hosstock-view-${data.referenceDate ?? 'empty'}.xlsx"`);
    res.send(Buffer.from(await toWorkbook(data)));
  }
}

@Module({
  controllers: [ExportsController],
  providers: [ViewDataService, ItemsService, DashboardService, RecommendationsService],
  exports: [ViewDataService],
})
export class ExportsModule {}
