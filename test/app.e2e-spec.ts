import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { addDays, todayInBangkok } from '../src/common/service-date.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

describe('API (e2e)', () => {
  let app: NestExpressApplication;
  let databaseUp = true;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({
        $queryRaw: () =>
          databaseUp ? Promise.resolve([1]) : Promise.reject(new Error('down')),
        // ยังไม่เคยตั้งราคา และไม่มีผู้ใช้ในระบบ
        rateConfig: { findFirst: () => Promise.resolve(null) },
        user: { findUnique: () => Promise.resolve(null) },
      })
      .compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/v1/health wraps the result in { data }', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/health')
      .expect(200);
    expect(response.body).toEqual({
      data: { status: 'ok', service: 'yard-control-backend', database: 'up' },
    });
  });

  it('GET /api/v1/ready answers 200 while the database is reachable', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/ready')
      .expect(200);
    expect(response.body).toEqual({ data: { status: 'ready' } });
  });

  it('GET /api/v1/ready answers 503 NOT_READY when the database is down', async () => {
    databaseUp = false;
    try {
      const response = await request(app.getHttpServer())
        .get('/api/v1/ready')
        .expect(503);
      expect(response.body.error.code).toBe('NOT_READY');
      // health ยังตอบ 200 เพื่อบอกว่า process ยังทำงาน
      const health = await request(app.getHttpServer())
        .get('/api/v1/health')
        .expect(200);
      expect(health.body.data.database).toBe('down');
    } finally {
      databaseUp = true;
    }
  });

  it('sends security headers on every response', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/rounds')
      .expect(200);
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['strict-transport-security']).toBeDefined();
    expect(response.headers['content-security-policy']).toBeDefined();
    expect(response.headers['x-powered-by']).toBeUndefined();
  });

  it('reports the rate limit applied to the caller', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/rounds')
      .expect(200);
    expect(response.headers['x-ratelimit-limit']).toBeDefined();
  });

  it('echoes the request id in the header and in error bodies', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/nope')
      .set('X-Request-Id', 'e2e-trace-1')
      .expect(404);
    expect(response.headers['x-request-id']).toBe('e2e-trace-1');
    expect(response.body.error.requestId).toBe('e2e-trace-1');
  });

  it('generates a request id when the client sends none', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/rounds')
      .expect(200);
    expect(response.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('GET /api/v1/rounds lists six 4-hour rounds', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/rounds')
      .expect(200);
    expect(response.body.data.rounds).toHaveLength(6);
    expect(response.body.data.rounds[0]).toEqual({
      index: 0,
      label: '07:00-11:00',
    });
  });

  it('POST /api/v1/bookings/quote returns the amount to pay now', async () => {
    // ใช้วันพรุ่งนี้ เพราะรอบของวันนี้ที่จบไปแล้วจองไม่ได้ (ผลจะขึ้นกับเวลาที่รัน test)
    const tomorrow = addDays(todayInBangkok(), 1);
    const response = await request(app.getHttpServer())
      .post('/api/v1/bookings/quote')
      .send({
        startDate: tomorrow,
        endDate: tomorrow,
        startRound: 0,
        roundCount: 2,
        slotCount: 3,
        plan: 'FULL',
      })
      .expect(200);
    expect(response.body.data).toMatchObject({
      type: 'SHORT',
      totalAmount: 600,
      payNowAmount: 600,
    });
  });

  it('rejects a malformed body with VALIDATION_FAILED', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/bookings/quote')
      .send({ startDate: 'tomorrow' })
      .expect(400);
    expect(response.body.error.code).toBe('VALIDATION_FAILED');
    expect(response.body.error.details.length).toBeGreaterThan(0);
  });

  it('rejects a rule-breaking request with BOOKING_INVALID', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/bookings/quote')
      .send({
        startDate: '2020-01-01',
        endDate: '2020-01-01',
        startRound: 0,
        roundCount: 1,
        slotCount: 1,
        plan: 'FULL',
      })
      .expect(422);
    expect(response.body.error).toMatchObject({
      code: 'BOOKING_INVALID',
      details: ['START_IN_PAST'],
    });
  });

  it('requires sign-in for everything that is not public', async () => {
    for (const path of [
      '/bookings',
      '/bookings/schedule',
      '/yard/live',
      '/auth/me',
      '/rates',
      '/reports/bookings',
      '/reports/dashboard',
    ]) {
      const response = await request(app.getHttpServer())
        .get(`/api/v1${path}`)
        .expect(401);
      expect(response.body.error.code).toBe('AUTH_REQUIRED');
    }
  });

  it('ignores a session cookie that was not signed by the server', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Cookie', 'ycs_session=eyJ1c2VySWQiOjF9.forged')
      .expect(401);
    expect(response.body.error.code).toBe('AUTH_REQUIRED');
  });

  it('answers a failed sign-in with one generic error', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ userType: 'EMPLOYEE', employeeCode: 'NOPE', password: 'x' })
      .expect(401);
    expect(response.body.error.code).toBe('AUTH_INVALID_CREDENTIALS');
    expect(response.headers['set-cookie']).toBeUndefined();
  });

  it('refuses a customer sign-in when CRM has no record of the phone', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ userType: 'BUYER', phone: '0810000000' })
      .expect(422);
    expect(response.body.error.code).toBe('REGISTER_NOT_IN_CRM');
    expect(response.headers['set-cookie']).toBeUndefined();
  });

  it('requires sign-in to get a fine payment', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/fines/1/payment')
      .expect(401);
    expect(response.body.error.code).toBe('AUTH_REQUIRED');
  });

  it('answers unknown routes with the error envelope', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/nope')
      .expect(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
  });
});
