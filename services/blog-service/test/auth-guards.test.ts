import { FastifyInstance } from 'fastify';
import { adminUser, closeTestApp, generateToken, initTestApp, testUser } from './setup';

describe('Auth & Role Guards Integration', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await initTestApp();
  });

  afterAll(async () => {
    await closeTestApp();
  });

  describe('JWT Verification', () => {
    it('should reject requests missing Authorization header on protected endpoints', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/posts',
        payload: {
          title: 'Test Unauthorized Post',
          content: 'This should fail because no token was supplied.',
        },
      });

      expect(res.statusCode).toBe(401);
      const body = JSON.parse(res.payload);
      expect(body.error).toBe('Unauthorized');
    });

    it('should reject requests with malformed Authorization header', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/posts',
        headers: {
          authorization: 'NotBearer token123',
        },
        payload: {
          title: 'Test Malformed Token',
          content: 'This should fail.',
        },
      });

      expect(res.statusCode).toBe(401);
    });

    it('should reject requests with invalid or tampered JWT tokens', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/posts',
        headers: {
          authorization: 'Bearer invalid.token.payload',
        },
        payload: {
          title: 'Test Invalid Token',
          content: 'This should fail.',
        },
      });

      expect(res.statusCode).toBe(401);
    });

    it('should accept valid tokens signed with Auth Service structure', async () => {
      const token = generateToken(testUser, app);

      const res = await app.inject({
        method: 'POST',
        url: '/posts',
        headers: {
          authorization: `Bearer ${token}`,
        },
        payload: {
          title: 'Test Authenticated Creation',
          content: 'This post is created with a valid token.',
        },
      });

      expect(res.statusCode).toBe(201);
      const post = JSON.parse(res.payload);
      expect(post.id).toBeDefined();
      expect(post.authorId).toBe(testUser.id);
      expect(post.title).toBe('Test Authenticated Creation');
    });
  });

  describe('Role-Based Authorization', () => {
    it('should forbid non-ADMIN users from creating categories', async () => {
      const userToken = generateToken(testUser, app);

      const res = await app.inject({
        method: 'POST',
        url: '/categories',
        headers: {
          authorization: `Bearer ${userToken}`,
        },
        payload: {
          name: 'Forbidden Category',
        },
      });

      expect(res.statusCode).toBe(403);
      const body = JSON.parse(res.payload);
      expect(body.error).toBe('Forbidden');
    });

    it('should allow ADMIN users to create categories', async () => {
      const adminToken = generateToken(adminUser, app);
      const catName = `Admin Category ${Date.now()}`;

      const res = await app.inject({
        method: 'POST',
        url: '/categories',
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
        payload: {
          name: catName,
          description: 'Created by admin in test',
        },
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.payload);
      expect(body.name).toBe(catName);
    });
  });
});
