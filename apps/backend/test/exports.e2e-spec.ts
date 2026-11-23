// CSV and Excel exports (ticket 22) on the indicators fixture (see items.e2e-spec.ts for its Items).
import type { INestApplication } from '@nestjs/common';
import ExcelJS from 'exceljs';
import request from 'supertest';
import * as path from 'node:path';
import { runEtl } from '../src/etl/run-etl';
import { PrismaService } from '../src/prisma/prisma.service';
import { seedDirector } from '../src/users/director-seed';
import { createTestApp, DIRECTOR } from './app';
import { FIXTURES, resetDatabase } from './helpers';

/** Minimal RFC 4180 parser (quotes, doubled quotes, CRLF) for the data block of an export. */
function parseCsv(text: string): { comments: string[]; rows: string[][] } {
  const lines = text.replace(/^﻿/, '').split('\r\n');
  const comments = lines.filter((l) => l.startsWith('# '));
  const body = lines.filter((l) => !l.startsWith('# ')).join('\r\n');
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (quoted) {
      if (c === '"' && body[i + 1] === '"') (field += '"'), i++;
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') (row.push(field), (field = ''));
    else if (c === '\r' && body[i + 1] === '\n') (row.push(field), rows.push(row), (row = []), (field = ''), i++);
    else field += c;
  }
  if (field !== '' || row.length) (row.push(field), rows.push(row));
  return { comments, rows };
}

const binary = (res: request.Response, done: (err: Error | null, body: Buffer) => void) => {
  const chunks: Buffer[] = [];
  res.on('data', (c: Buffer) => chunks.push(c));
  res.on('end', () => done(null, Buffer.concat(chunks)));
};

describe('Exports API', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let cookie: string;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    await resetDatabase(prisma);
    await seedDirector(prisma);
    await runEtl(prisma, path.join(FIXTURES, 'indicators'));
    const res = await http().post('/api/auth/login').send({ email: DIRECTOR.email, password: DIRECTOR.password }).expect(200);
    cookie = (res.headers['set-cookie'] as unknown as string[])[0].split(';')[0];
  });
  afterAll(async () => {
    await app.close();
  });

  const csv = async (query = '') => {
    const res = await http().get(`/api/exports/inventory.csv${query}`).set('Cookie', cookie).expect(200);
    return { res, ...parseCsv(res.text) };
  };
  const xlsx = async (query = '') => {
    const res = await http()
      .get(`/api/exports/view.xlsx${query}`)
      .set('Cookie', cookie)
      .buffer(true)
      .parse(binary as never)
      .expect(200);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(res.body as unknown as ArrayBuffer);
    return { res, wb };
  };
  const sheetText = (sheet: ExcelJS.Worksheet) => {
    const out: string[] = [];
    sheet.eachRow((row) => out.push((row.values as unknown[]).slice(1).join(' ')));
    return out;
  };

  it('requires login', async () => {
    await http().get('/api/exports/inventory.csv').expect(401);
    await http().get('/api/exports/view.xlsx').expect(401);
  });

  it('rejects bad filters with 400, like the views', async () => {
    await http().get('/api/exports/inventory.csv?urgencyLevel=BOGUS').set('Cookie', cookie).expect(400);
    await http().get('/api/exports/view.xlsx?from=2025-02-30').set('Cookie', cookie).expect(400);
  });

  it('CSV: attachment, BOM, metadata comments, one row per Item of the unfiltered slice', async () => {
    const { res, comments, rows } = await csv();
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    expect(res.headers['content-disposition']).toMatch(/^attachment; filename="hosstock-inventory-2025-01-10\.csv"$/);
    expect(res.text.charCodeAt(0)).toBe(0xfeff);
    expect(comments).toContain('# Reference Date: 2025-01-10');
    expect(comments).toContain('# Filters: none');
    expect(rows[0]).toContain('Item');
    expect(rows.slice(1).map((r) => r[rows[0].indexOf('Item')])).toEqual(['Syringe', 'Ventilator', 'Monitor', 'Gauze', 'Pump Set']);
    // Plain decimals: no thousands separator, "." decimal mark.
    const value = rows[1][rows[0].indexOf('Stock Value')];
    expect(value).toMatch(/^-?\d+(\.\d+)?$/);
  });

  it('CSV contains only the filtered rows and states the filters, matching /api/items', async () => {
    const query = '?urgencyLevel=CRITICAL';
    const { comments, rows } = await csv(query);
    const api = await http().get(`/api/items${query}`).set('Cookie', cookie).expect(200);
    const names = (api.body.items as { name: string }[]).map((i) => i.name);
    expect(names).toEqual(['Monitor']);
    expect(rows.slice(1).map((r) => r[rows[0].indexOf('Item')])).toEqual(names);
    expect(comments).toContain('# Filter Urgency Level: Critical');
    expect(comments).toContain('# Reference Date: 2025-01-10');
  });

  it('CSV filters by category and escapes nothing it should not', async () => {
    const all = await http().get('/api/items').set('Cookie', cookie).expect(200);
    const category = (all.body.items as { category: string }[])[0].category;
    const expected = (all.body.items as { name: string; category: string }[]).filter((i) => i.category === category).map((i) => i.name);
    const { comments, rows } = await csv(`?category=${encodeURIComponent(category)}`);
    expect(rows.slice(1).map((r) => r[rows[0].indexOf('Item')])).toEqual(expected);
    expect(comments).toContain(`# Filter Category: ${category}`);
  });

  it('CSV honours the Reference Date (to) and states it', async () => {
    const { comments, rows } = await csv('?to=2025-01-05');
    expect(comments).toContain('# Reference Date: 2025-01-10');
    expect(comments.some((c) => c.includes('2025-01-05'))).toBe(true);
    // Pump Set has no state by 2025-01-05 but still appears as an Item; the count matches the view.
    const api = await http().get('/api/items?to=2025-01-05').set('Cookie', cookie).expect(200);
    expect(rows.length - 1).toBe(api.body.items.length);
  });

  it('Excel: a KPI sheet plus one sheet per table, with filters and Reference Date on each sheet', async () => {
    const { res, wb } = await xlsx('?urgencyLevel=CRITICAL');
    expect(res.headers['content-disposition']).toMatch(/^attachment; filename="hosstock-view-2025-01-10\.xlsx"$/);
    expect(wb.worksheets.map((s) => s.name)).toEqual(['KPIs', 'Inventory', 'Top Items', 'Recommendations']);
    for (const sheet of wb.worksheets) {
      const text = sheetText(sheet).join('\n');
      expect(text).toContain('Reference Date 2025-01-10');
      expect(text).toContain('Urgency Level: Critical');
    }

    // KPIs equal the dashboard's for the same query (the Monitor alone: 30 units x 5 = 150).
    const dash = await http().get('/api/dashboard?urgencyLevel=CRITICAL').set('Cookie', cookie).expect(200);
    const kpiRows = new Map<string, unknown>();
    wb.getWorksheet('KPIs')!.eachRow((row) => kpiRows.set(String(row.getCell(1).value), row.getCell(3).value));
    expect(kpiRows.get('Stock Value')).toBeCloseTo(dash.body.current.stockValue, 6);
    expect(kpiRows.get('Items Below Minimum')).toBe(dash.body.current.belowMinimumCount);
    expect(kpiRows.get('Stock Value')).toBe(150);

    // Inventory sheet holds only the filtered Item, numbers as numbers.
    const inv = wb.getWorksheet('Inventory')!;
    const header = inv.getRow(inv.rowCount - 1).values as unknown[];
    const itemCol = header.indexOf('Item');
    expect(itemCol).toBeGreaterThan(0);
    expect(inv.getRow(inv.rowCount).getCell(itemCol).value).toBe('Monitor');
    expect(typeof inv.getRow(inv.rowCount).getCell(header.indexOf('Stock Value')).value).toBe('number');
    const top = wb.getWorksheet('Top Items')!;
    expect(sheetText(top).join('\n')).toContain('Monitor');
    expect(sheetText(top).join('\n')).not.toContain('Syringe');
  });

  it('Excel without filters states "none" and lists every Item', async () => {
    const { wb } = await xlsx();
    const inv = wb.getWorksheet('Inventory')!;
    expect(sheetText(inv).join('\n')).toContain('Filters none');
    const names = sheetText(inv).filter((l) => /Syringe|Ventilator|Monitor|Gauze|Pump Set/.test(l));
    expect(names).toHaveLength(5);
  });
});
