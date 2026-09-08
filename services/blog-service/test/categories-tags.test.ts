import { FastifyInstance } from 'fastify';
import { adminUser, closeTestApp, generateToken, initTestApp, testUser } from './setup';

describe('Categories & Tags API', () => {
  let app: FastifyInstance;
  let adminToken: string;
  let userToken: string;

  beforeAll(async () => {
    app = await initTestApp();
    adminToken = generateToken(adminUser, app);
    userToken = generateToken(testUser, app);
  });

  afterAll(async () => {
    await closeTestApp();
  });

  describe('Categories', () => {
    let createdCategoryId: string;
    const testCategoryName = `Test Category ${Date.now()}`;

    it('should list categories publicly without authentication', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/categories',
      });

      expect(res.statusCode).toBe(200);
      const list = JSON.parse(res.payload);
      expect(Array.isArray(list)).toBe(true);
    });

    it('should create a category as ADMIN', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/categories',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          name: testCategoryName,
          description: 'A test category description',
        },
      });

      expect(res.statusCode).toBe(201);
      const data = JSON.parse(res.payload);
      expect(data.name).toBe(testCategoryName);
      expect(data.slug).toBeDefined();
      createdCategoryId = data.id;
    });

    it('should fail with 400 validation error if name is too short', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/categories',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          name: 'x',
        },
      });

      expect(res.statusCode).toBe(400);
    });

    it('should get a category by ID or slug publicly', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/categories/${createdCategoryId}`,
      });

      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res.payload);
      expect(data.id).toBe(createdCategoryId);
    });

    it('should update a category as ADMIN', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: `/categories/${createdCategoryId}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          description: 'Updated category description',
        },
      });

      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res.payload);
      expect(data.description).toBe('Updated category description');
    });

    it('should delete a category as ADMIN', async () => {
      const res = await app.inject({
        method: 'DELETE',
        url: `/categories/${createdCategoryId}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res.payload);
      expect(data.success).toBe(true);
    });
  });

  describe('Tags', () => {
    let createdTagId: string;
    const testTagName = `Tag-${Date.now()}`;

    it('should list tags publicly', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/tags',
      });

      expect(res.statusCode).toBe(200);
      const list = JSON.parse(res.payload);
      expect(Array.isArray(list)).toBe(true);
    });

    it('should prevent regular USER from creating a tag', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/tags',
        headers: { authorization: `Bearer ${userToken}` },
        payload: { name: 'Unauthorized Tag' },
      });

      expect(res.statusCode).toBe(403);
    });

    it('should allow ADMIN to create a tag', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/tags',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { name: testTagName },
      });

      expect(res.statusCode).toBe(201);
      const data = JSON.parse(res.payload);
      expect(data.name).toBe(testTagName);
      expect(data.slug).toBeDefined();
      createdTagId = data.id;
    });

    it('should get a tag by ID or slug publicly', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/tags/${createdTagId}`,
      });

      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res.payload);
      expect(data.id).toBe(createdTagId);
    });

    it('should delete a tag as ADMIN', async () => {
      const res = await app.inject({
        method: 'DELETE',
        url: `/tags/${createdTagId}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res.payload);
      expect(data.success).toBe(true);
    });
  });
});
