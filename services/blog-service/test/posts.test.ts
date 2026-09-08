import { FastifyInstance } from 'fastify';
import { adminUser, anotherUser, closeTestApp, generateToken, initTestApp, testUser } from './setup';
import { prisma } from '../src/database/prisma';

describe('Posts API End-to-End', () => {
  let app: FastifyInstance;
  let authorToken: string;
  let otherToken: string;
  let adminToken: string;

  beforeAll(async () => {
    await prisma.post.deleteMany({
      where: {
        authorId: { in: [testUser.id, anotherUser.id, adminUser.id] },
      },
    });
    app = await initTestApp();
    authorToken = generateToken(testUser, app);
    otherToken = generateToken(anotherUser, app);
    adminToken = generateToken(adminUser, app);
  });

  afterAll(async () => {
    await prisma.post.deleteMany({
      where: {
        authorId: { in: [testUser.id, anotherUser.id, adminUser.id] },
      },
    });
    await closeTestApp();
  });

  describe('Post Creation & Slug Generation', () => {
    it('should create a post with SEO fields and automatically generated slug', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/posts',
        headers: { authorization: `Bearer ${authorToken}` },
        payload: {
          title: 'Mastering Fastify and TypeScript in Microservices',
          content: 'Here is a comprehensive guide to building microservices with Fastify.',
          excerpt: 'Short summary of the post.',
          published: true,
          featured: true,
          metaTitle: 'Mastering Fastify | GitRabbit',
          metaDescription: 'SEO description for Fastify guide',
          canonicalUrl: 'https://gitrabbit.com/blog/mastering-fastify',
          featuredImage: 'https://example.com/fastify.png',
        },
      });

      expect(res.statusCode).toBe(201);
      const post = JSON.parse(res.payload);
      expect(post.id).toBeDefined();
      expect(post.authorId).toBe(testUser.id);
      expect(post.slug).toBe('mastering-fastify-and-typescript-in-microservices');
      expect(post.featured).toBe(true);
      expect(post.metaTitle).toBe('Mastering Fastify | GitRabbit');
      expect(post.views).toBe(0);
    });

    it('should handle slug collisions by appending a unique counter', async () => {
      const title = 'Unique Collision Test Title';

      const firstRes = await app.inject({
        method: 'POST',
        url: '/posts',
        headers: { authorization: `Bearer ${authorToken}` },
        payload: { title, content: 'First post content', published: true },
      });
      expect(firstRes.statusCode).toBe(201);
      const firstPost = JSON.parse(firstRes.payload);

      const secondRes = await app.inject({
        method: 'POST',
        url: '/posts',
        headers: { authorization: `Bearer ${authorToken}` },
        payload: { title, content: 'Second post content', published: true },
      });
      expect(secondRes.statusCode).toBe(201);
      const secondPost = JSON.parse(secondRes.payload);

      expect(firstPost.slug).toBe('unique-collision-test-title');
      expect(secondPost.slug).toBe('unique-collision-test-title-1');
    });
  });

  describe('Post Retrieval, View Counting & Drafts', () => {
    let publishedSlug: string;
    let publishedPostId: string;
    let draftPostId: string;

    beforeAll(async () => {
      // Create a published post
      const pubRes = await app.inject({
        method: 'POST',
        url: '/posts',
        headers: { authorization: `Bearer ${authorToken}` },
        payload: {
          title: 'Publicly Accessible Article',
          content: 'Content that is available to everyone.',
          published: true,
        },
      });
      const pubData = JSON.parse(pubRes.payload);
      publishedSlug = pubData.slug;
      publishedPostId = pubData.id;

      // Create a draft post
      const draftRes = await app.inject({
        method: 'POST',
        url: '/posts',
        headers: { authorization: `Bearer ${authorToken}` },
        payload: {
          title: 'Author Draft Article',
          content: 'Secret unpublished content.',
          published: false,
        },
      });
      const draftData = JSON.parse(draftRes.payload);
      draftPostId = draftData.id;
    });

    it('should list published posts publicly with pagination', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/posts?page=1&limit=5',
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.data).toBeDefined();
      expect(body.pagination).toBeDefined();
      expect(body.pagination.page).toBe(1);
      expect(body.pagination.limit).toBe(5);
      expect(body.data.every((p: any) => p.published === true)).toBe(true);
    });

    it('should retrieve published post by slug and increment its view count', async () => {
      const firstGet = await app.inject({
        method: 'GET',
        url: `/posts/slug/${publishedSlug}`,
      });
      expect(firstGet.statusCode).toBe(200);
      const firstData = JSON.parse(firstGet.payload);
      const initialViews = firstData.views;

      const secondGet = await app.inject({
        method: 'GET',
        url: `/posts/slug/${publishedSlug}`,
      });
      expect(secondGet.statusCode).toBe(200);
      const secondData = JSON.parse(secondGet.payload);
      expect(secondData.views).toBe(initialViews + 1);
    });

    it('should forbid anonymous users from viewing draft post by ID', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/posts/${draftPostId}`,
      });

      expect(res.statusCode).toBe(403);
    });

    it('should allow author to view own draft post by ID', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/posts/${draftPostId}`,
        headers: { authorization: `Bearer ${authorToken}` },
      });

      expect(res.statusCode).toBe(200);
      const post = JSON.parse(res.payload);
      expect(post.id).toBe(draftPostId);
      expect(post.published).toBe(false);
    });

    it('should allow author to list drafts via /posts/drafts', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/posts/drafts',
        headers: { authorization: `Bearer ${authorToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.data.length).toBeGreaterThan(0);
      expect(body.data.every((p: any) => p.published === false)).toBe(true);
    });
  });

  describe('Post Authorization (Update & Delete)', () => {
    let postToModifyId: string;

    beforeEach(async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/posts',
        headers: { authorization: `Bearer ${authorToken}` },
        payload: {
          title: 'Post to be Modified',
          content: 'Original content.',
          published: false,
        },
      });
      const data = JSON.parse(res.payload);
      postToModifyId = data.id;
    });

    it('should forbid another non-author user from updating the post', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: `/posts/${postToModifyId}`,
        headers: { authorization: `Bearer ${otherToken}` },
        payload: {
          title: 'Hacked Title',
        },
      });

      expect(res.statusCode).toBe(403);
    });

    it('should allow the author to update their own post', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: `/posts/${postToModifyId}`,
        headers: { authorization: `Bearer ${authorToken}` },
        payload: {
          title: 'Updated by Author Title',
          excerpt: 'New excerpt',
        },
      });

      expect(res.statusCode).toBe(200);
      const updated = JSON.parse(res.payload);
      expect(updated.title).toBe('Updated by Author Title');
      expect(updated.excerpt).toBe('New excerpt');
    });

    it('should allow ADMIN to update any post', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: `/posts/${postToModifyId}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          title: 'Updated by Admin Title',
        },
      });

      expect(res.statusCode).toBe(200);
      const updated = JSON.parse(res.payload);
      expect(updated.title).toBe('Updated by Admin Title');
    });

    it('should allow author to publish the post via /publish endpoint', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: `/posts/${postToModifyId}/publish`,
        headers: { authorization: `Bearer ${authorToken}` },
        payload: { published: true },
      });

      expect(res.statusCode).toBe(200);
      const post = JSON.parse(res.payload);
      expect(post.published).toBe(true);
    });

    it('should forbid another non-author user from deleting the post', async () => {
      const res = await app.inject({
        method: 'DELETE',
        url: `/posts/${postToModifyId}`,
        headers: { authorization: `Bearer ${otherToken}` },
      });

      expect(res.statusCode).toBe(403);
    });

    it('should allow author to delete the post', async () => {
      const res = await app.inject({
        method: 'DELETE',
        url: `/posts/${postToModifyId}`,
        headers: { authorization: `Bearer ${authorToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.success).toBe(true);
    });
  });
});
