// PDF report (ticket 23) on the indicators fixture (see items.e2e-spec.ts for its Items).
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as path from 'node:path';
import { runEtl } from '../src/etl/run-etl';
import { ReportService } from '../src/exports/exports.module';
import { definitionTexts } from '../src/exports/report';
import { PrismaService } from '../src/prisma/prisma.service';
import { seedDirector } from '../src/users/director-seed';
import { createTestApp, DIRECTOR } from './app';
import { FIXTURES, resetDatabase } from './helpers';

const ITEMS = ['Syringe', 'Ventilator', 'Monitor', 'Gauze', 'Pump Set'];

describe('PDF report API', () => {
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

  const pdf = (query = '') =>
    http()
      .get(`/api/exports/report.pdf${query}`)
      .set('Cookie', cookie)
      .buffer(true)
      .parse(((res: request.Response, done: (err: Error | null, body: Buffer) => void) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => done(null, Buffer.concat(chunks)));
      }) as never);

  it('requires login and rejects bad filters', async () => {
    await http().get('/api/exports/report.pdf').expect(401);
    await http().get('/api/exports/report.pdf?urgencyLevel=BOGUS').set('Cookie', cookie).expect(400);
    await http().get('/api/exports/report.pdf?from=2025-02-30').set('Cookie', cookie).expect(400);
  });

  it('returns a PDF attachment', async () => {
    const res = await pdf().expect(200);
    expect(res.headers['content-type']).toMatch(/^application\/pdf/);
    expect(res.headers['content-disposition']).toBe('attachment; filename="hosstock-report-2025-01-10.pdf"');
    expect((res.body as Buffer).subarray(0, 4).toString()).toBe('%PDF');
  });

  it('the document of a filtered query holds only the filtered Items, matching /api/items', async () => {
    const query = '?urgencyLevel=CRITICAL';
    await pdf(query).expect(200);
    const api = await http().get(`/api/items${query}`).set('Cookie', cookie).expect(200);
    const names = (api.body.items as { name: string }[]).map((i) => i.name);
    expect(names).toEqual(['Monitor']);

    const { definition } = await app.get(ReportService).definition({ urgencyLevel: 'CRITICAL' } as never);
    const texts = definitionTexts(definition);
    expect(texts).toContain('Urgency Level: Critical');
    expect(texts).toContain('Reference Date: 2025-01-10');
    for (const n of ITEMS) expect(texts.includes(n)).toBe(names.includes(n));
  });

  it('without filters lists every Item and "Filters: none"', async () => {
    const { definition } = await app.get(ReportService).definition({} as never);
    const texts = definitionTexts(definition);
    expect(texts).toContain('Filters: none');
    for (const n of ITEMS) expect(texts).toContain(n);
  });
});
