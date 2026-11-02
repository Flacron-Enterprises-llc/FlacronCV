import { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';

async function createApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>();
  configureApp(app, { corsOrigins: ['http://localhost:3001'] });
  await app.init();
  return app;
}

describe('health with the local database', () => {
  let app: INestApplication;

  beforeAll(async () => {
    expect(process.env.DATABASE_URL?.trim()).toBeTruthy();
    app = await createApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/career/v1/health returns 200', async () => {
    const res = await request(app.getHttpServer()).get('/api/career/v1/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('GET /api/career/v1/health/ready returns 200', async () => {
    const res = await request(app.getHttpServer()).get('/api/career/v1/health/ready');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});

describe('health when the database cannot be reached', () => {
  let app: INestApplication;
  const savedUrl = process.env.DATABASE_URL;

  beforeAll(async () => {
    // Nothing listens on port 1, so the connection is refused.
    process.env.DATABASE_URL = 'postgresql://nobody:nothing@127.0.0.1:1/none';
    app = await createApp();
  });

  afterAll(async () => {
    await app.close();
    process.env.DATABASE_URL = savedUrl;
  });

  it('GET /api/career/v1/health still returns 200', async () => {
    const res = await request(app.getHttpServer()).get('/api/career/v1/health');
    expect(res.status).toBe(200);
  });

  it('GET /api/career/v1/health/ready returns 503 database_unavailable', async () => {
    const res = await request(app.getHttpServer()).get('/api/career/v1/health/ready');
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ code: 'database_unavailable' });
  });
});
