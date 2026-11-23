import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from './app';

describe('GET /api/health', () => {
  let app: INestApplication;

  beforeAll(async () => {
    ({ app } = await createTestApp());
  });
  afterAll(async () => {
    await app.close();
  });

  it('reports that the backend and the database are up, without logging in', async () => {
    await request(app.getHttpServer()).get('/api/health').expect(200, { status: 'ok', database: 'up' });
  });
});
