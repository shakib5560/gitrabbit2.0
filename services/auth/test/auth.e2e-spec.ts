import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import cookieParser from 'cookie-parser';
import { AppModule } from '../src/app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

describe('Auth Service End-to-End Test Suite', () => {
  let app: INestApplication<App>;
  const testUser = {
    name: 'E2E Test User',
    email: `e2e_user_${Date.now()}@example.com`,
    password: 'Password123!',
  };

  let accessToken = '';
  let refreshCookie = '';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
      }),
    );

    // Setup Swagger
    const config = new DocumentBuilder()
      .setTitle('GitRabbit Auth Service API')
      .setDescription('End-to-end API test verification')
      .setVersion('1.0.0')
      .addTag('Auth')
      .addTag('System')
      .addBearerAuth(
        {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          in: 'header',
        },
        'JWT-auth',
      )
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('docs', app, document);

    await app.init();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('System & Documentation Endpoints', () => {
    it('GET / should return 200 and greeting', async () => {
      const res = await request(app.getHttpServer()).get('/').expect(200);
      expect(res.text).toBe('Hello World!');
    });

    it('GET /docs/ should serve Swagger UI HTML', async () => {
      const res = await request(app.getHttpServer()).get('/docs/').expect(200);
      expect(res.text).toContain('swagger-ui');
    });

    it('GET /docs-json should serve OpenAPI JSON schema', async () => {
      const res = await request(app.getHttpServer()).get('/docs-json').expect(200);
      expect(res.body.info.title).toBe('GitRabbit Auth Service API');
      expect(res.body.paths['/auth/register']).toBeDefined();
      expect(res.body.paths['/auth/login']).toBeDefined();
      expect(res.body.paths['/auth/me']).toBeDefined();
      expect(res.body.components.securitySchemes['JWT-auth']).toBeDefined();
    });
  });

  describe('Authentication Lifecycle', () => {
    it('POST /auth/register - should validate input and reject weak passwords', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          name: 'Invalid User',
          email: 'invalid@example.com',
          password: 'short',
        })
        .expect(400);

      expect(res.body.message).toBeDefined();
    });

    it('POST /auth/register - should successfully register a new user and set cookie', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/register')
        .send(testUser)
        .expect(201);

      expect(res.body.accessToken).toBeDefined();
      expect(res.body.user).toBeDefined();
      expect(res.body.user.email).toBe(testUser.email);
      expect(res.body.user.name).toBe(testUser.name);

      // Verify Set-Cookie header contains Refresh cookie
      const cookies = res.headers['set-cookie'] as unknown as string[];
      expect(cookies).toBeDefined();
      const refreshCookieHeader = cookies.find((c: string) => c.startsWith('Refresh='));
      expect(refreshCookieHeader).toBeDefined();

      accessToken = res.body.accessToken;
      refreshCookie = refreshCookieHeader!.split(';')[0];
    });

    it('POST /auth/register - should reject duplicate email registration', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/register')
        .send(testUser)
        .expect(400);

      expect(res.body.message).toBe('Email already in use');
    });

    it('POST /auth/login - should fail with incorrect password', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: testUser.email,
          password: 'WrongPassword999!',
        })
        .expect(401);

      expect(res.body.message).toBe('Invalid credentials');
    });

    it('POST /auth/login - should successfully login with valid credentials', async () => {
      // Wait 1 second so jwt iat timestamp changes and token string is unique
      await new Promise((resolve) => setTimeout(resolve, 1100));

      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: testUser.email,
          password: testUser.password,
        })
        .expect(201);


      expect(res.body.accessToken).toBeDefined();
      expect(res.body.user.email).toBe(testUser.email);

      const cookies = res.headers['set-cookie'] as unknown as string[];
      expect(cookies).toBeDefined();
      const refreshCookieHeader = cookies.find((c: string) => c.startsWith('Refresh='));
      expect(refreshCookieHeader).toBeDefined();

      accessToken = res.body.accessToken;
      refreshCookie = refreshCookieHeader!.split(';')[0];
    });

    it('GET /auth/me - should reject request without Bearer token', async () => {
      await request(app.getHttpServer()).get('/auth/me').expect(401);
    });

    it('GET /auth/me - should return user profile with valid Bearer token', async () => {
      const res = await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.userId).toBeDefined();
      expect(res.body.email).toBe(testUser.email);
      expect(res.body.role).toBe('USER');
    });

    it('POST /auth/refresh - should fail without Refresh cookie', async () => {
      await request(app.getHttpServer()).post('/auth/refresh').expect(401);
    });

    it('POST /auth/refresh - should issue new access token using valid Refresh cookie', async () => {
      // Wait 1 second so jwt iat timestamp changes and token string is unique
      await new Promise((resolve) => setTimeout(resolve, 1100));

      const res = await request(app.getHttpServer())
        .post('/auth/refresh')
        .set('Cookie', [refreshCookie])
        .expect(201);


      expect(res.body.accessToken).toBeDefined();

      // Update refresh cookie from rotation
      const cookies = res.headers['set-cookie'] as unknown as string[];
      if (cookies) {
        const refreshCookieHeader = cookies.find((c: string) => c.startsWith('Refresh='));
        if (refreshCookieHeader) {
          refreshCookie = refreshCookieHeader.split(';')[0];
        }
      }
    });

    it('POST /auth/logout - should successfully invalidate session and clear cookie', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/logout')
        .set('Cookie', [refreshCookie])
        .expect(201);

      expect(res.body.message).toBe('Logged out successfully');

      // Refresh cookie should be cleared
      const cookies = res.headers['set-cookie'] as unknown as string[];
      expect(cookies).toBeDefined();
      const refreshCookieHeader = cookies.find((c: string) => c.startsWith('Refresh=;'));
      expect(refreshCookieHeader).toBeDefined();
    });

    it('POST /auth/refresh - should reject refresh after logout (token revoked)', async () => {
      await request(app.getHttpServer())
        .post('/auth/refresh')
        .set('Cookie', [refreshCookie])
        .expect(403);
    });
  });
});
