import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import cookieParser from 'cookie-parser';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { TokenType } from '@prisma/client';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

describe('Auth Service End-to-End Test Suite', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const testUser = {
    name: 'E2E Test User',
    email: `e2e_user_${Date.now()}@example.com`,
    password: 'Password123!',
  };

  let accessToken = '';
  let refreshCookie = '';

  beforeAll(async () => {
    jest.setTimeout(30000);
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    prisma = app.get(PrismaService);
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

    it('PATCH /auth/profile - should update user profile name and avatar', async () => {
      const res = await request(app.getHttpServer())
        .patch('/auth/profile')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'Updated Test User',
          avatarUrl: 'https://avatars.githubusercontent.com/u/9999999?v=4',
        })
        .expect(200);

      expect(res.body.name).toBe('Updated Test User');
      expect(res.body.avatarUrl).toBe('https://avatars.githubusercontent.com/u/9999999?v=4');
    });

    it('POST /auth/verify-token - should verify valid token', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/verify-token')
        .send({ token: accessToken })
        .expect(200);

      expect(res.body.valid).toBe(true);
      expect(res.body.user).toBeDefined();
      expect(res.body.user.email).toBe(testUser.email);
    });

    it('POST /auth/verify-token - should return valid: false for invalid token', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/verify-token')
        .send({ token: 'invalid.jwt.token' })
        .expect(200);

      expect(res.body.valid).toBe(false);
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

  describe('Email Verification & Account Recovery', () => {
    it('POST /auth/send-verification-email - should send verification email', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/send-verification-email')
        .send({ email: testUser.email })
        .expect(200);

      expect(res.body.message).toBeDefined();
    });

    it('POST /auth/verify-email - should reject invalid token', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/verify-email')
        .send({ token: 'non_existent_token_12345' })
        .expect(400);

      expect(res.body.message).toContain('Invalid or expired verification token');
    });

    it('POST /auth/verify-email - should verify email with valid token', async () => {
      const user = await prisma.user.findUnique({
        where: { email: testUser.email },
      });
      expect(user).toBeDefined();

      const verificationToken = await prisma.verificationToken.findFirst({
        where: { userId: user!.id, type: TokenType.EMAIL_VERIFICATION },
      });
      expect(verificationToken).toBeDefined();

      const res = await request(app.getHttpServer())
        .post('/auth/verify-email')
        .send({ token: verificationToken!.token })
        .expect(200);

      expect(res.body.success).toBe(true);

      const updatedUser = await prisma.user.findUnique({
        where: { id: user!.id },
      });
      expect(updatedUser!.isEmailVerified).toBe(true);
    });

    it('POST /auth/forgot-username - should send username reminder', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/forgot-username')
        .send({ email: testUser.email })
        .expect(200);

      expect(res.body.message).toBeDefined();
    });

    it('POST /auth/forgot-password - should generate reset token and dispatch email', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/forgot-password')
        .send({ email: testUser.email })
        .expect(200);

      expect(res.body.message).toBeDefined();
    });

    it('POST /auth/reset-password - should reset password with valid token and allow new login', async () => {
      const user = await prisma.user.findUnique({
        where: { email: testUser.email },
      });
      expect(user).toBeDefined();

      const resetTokenRecord = await prisma.verificationToken.findFirst({
        where: { userId: user!.id, type: TokenType.PASSWORD_RESET },
      });
      expect(resetTokenRecord).toBeDefined();

      const newPassword = 'BrandNewPassword999!';

      const res = await request(app.getHttpServer())
        .post('/auth/reset-password')
        .send({
          token: resetTokenRecord!.token,
          newPassword,
        })
        .expect(200);

      expect(res.body.success).toBe(true);

      // Verify that old password now fails
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: testUser.email,
          password: testUser.password,
        })
        .expect(401);

      // Verify that new password succeeds
      const loginRes = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: testUser.email,
          password: newPassword,
        })
        .expect(201);

      expect(loginRes.body.accessToken).toBeDefined();
      expect(loginRes.body.user.isEmailVerified).toBe(true);
    });
  });
});
