import { Controller, ForbiddenException, Get, INestApplication, UnauthorizedException } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { Public } from '../src/auth/auth.guard';
import { configureApp } from '../src/configure-app';

@Public()
@Controller('test-errors')
class ThrowingController {
  @Get('unauthorized')
  unauthorized(): never {
    throw new UnauthorizedException();
  }

  @Get('forbidden')
  forbidden(): never {
    throw new ForbiddenException();
  }

  @Get('crash')
  crash(): never {
    throw new Error('secret detail that must not leak');
  }
}

describe('error bodies', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [ThrowingController],
    }).compile();
    const expressApp = moduleRef.createNestApplication<NestExpressApplication>();
    configureApp(expressApp, { corsOrigins: ['http://localhost:3001'] });
    app = expressApp;
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('an unknown route is 404 not_found, not a 500', async () => {
    const res = await request(app.getHttpServer()).get('/api/career/v1/no-such-route');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ code: 'not_found' });
  });

  it('a route outside the prefix is 404 not_found', async () => {
    const res = await request(app.getHttpServer()).get('/health');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ code: 'not_found' });
  });

  it('a framework 401 is unauthenticated', async () => {
    const res = await request(app.getHttpServer()).get('/api/career/v1/test-errors/unauthorized');
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ code: 'unauthenticated' });
  });

  it('a framework 403 is permission_denied', async () => {
    const res = await request(app.getHttpServer()).get('/api/career/v1/test-errors/forbidden');
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ code: 'permission_denied' });
  });

  it('an unexpected error is 500 internal_error without the message', async () => {
    const res = await request(app.getHttpServer()).get('/api/career/v1/test-errors/crash');
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ code: 'internal_error' });
  });
});
