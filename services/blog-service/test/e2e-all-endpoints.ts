import crypto from 'crypto';

const BASE_URL = process.env.BLOG_SERVICE_URL || 'http://localhost:4000';
const JWT_SECRET = process.env.JWT_SECRET || 'zV8adrd31EFoqU6O2f3R24qYQGamxvMWIzSYwrJ4nSe';

interface User {
  id: string;
  email: string;
  role: string;
}

const testAuthor: User = {
  id: 'e2e00001-0000-0000-0000-000000000001',
  email: 'e2e-author@gitrabbit.com',
  role: 'USER',
};

const otherUser: User = {
  id: 'e2e00002-0000-0000-0000-000000000002',
  email: 'e2e-other@gitrabbit.com',
  role: 'USER',
};

const adminUser: User = {
  id: 'e2e00003-0000-0000-0000-000000000003',
  email: 'e2e-admin@gitrabbit.com',
  role: 'ADMIN',
};

function createJwt(user: User): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(
    JSON.stringify({
      sub: user.id,
      email: user.email,
      role: user.role,
    }),
  ).toString('base64url');
  const signature = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${signature}`;
}

const authorToken = createJwt(testAuthor);
const otherToken = createJwt(otherUser);
const adminToken = createJwt(adminUser);

let passedTests = 0;
let failedTests = 0;

async function test(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    console.log(`\x1b[32m  ✓ PASS:\x1b[0m ${name}`);
    passedTests++;
  } catch (error: any) {
    console.error(`\x1b[31m  ✗ FAIL:\x1b[0m ${name}`);
    console.error(`    \x1b[33mError:\x1b[0m ${error.message}`);
    failedTests++;
  }
}

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function request(path: string, options: { method?: string; token?: string; body?: any } = {}) {
  const headers: Record<string, string> = {};
  if (options.token) {
    headers['Authorization'] = `Bearer ${options.token}`;
  }
  if (options.body) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const contentType = res.headers.get('content-type') || '';
  let data: any = null;
  if (contentType.includes('application/json')) {
    data = await res.json();
  } else {
    data = await res.text();
  }

  return { status: res.status, headers: res.headers, data };
}

async function runAllE2ETests() {
  console.log(`\n======================================================`);
  console.log(`  Blog Service End-to-End Test Suite`);
  console.log(`  Target: ${BASE_URL}`);
  console.log(`======================================================\n`);

  const runId = Date.now();
  let createdCategoryId: string;
  let createdCategorySlug: string;
  let createdTagId: string;
  let createdTagSlug: string;
  let draftPostId: string;
  let publishedPostId: string;
  let publishedPostSlug: string;

  // 1. System Health Check
  console.log(`\x1b[34m[1. System Telemetry & Docs]\x1b[0m`);
  await test('GET /health returns 200 and database connected', async () => {
    const res = await request('/health');
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    assert(res.data.status === 'ok', `Expected status 'ok', got ${res.data.status}`);
    assert(res.data.database === 'connected', `Expected database 'connected', got ${res.data.database}`);
    assert(res.data.service === 'blog-service', `Expected service 'blog-service'`);
  });

  await test('GET /docs loads Swagger UI web application', async () => {
    const res = await request('/docs');
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    assert(typeof res.data === 'string' && res.data.includes('swagger-ui'), 'Expected HTML containing swagger-ui');
  });

  await test('GET /docs/json returns valid OpenAPI 3.0 document', async () => {
    const res = await request('/docs/json');
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    assert(res.data.openapi && res.data.openapi.startsWith('3.'), 'Expected OpenAPI 3.x specification');
    assert(res.data.info.title === 'GitRabbit Blog Service API', 'Expected proper service title');
    assert(res.data.paths['/posts'] !== undefined, 'Expected /posts in OpenAPI paths');
    assert(res.data.paths['/categories'] !== undefined, 'Expected /categories in OpenAPI paths');
    assert(res.data.paths['/tags'] !== undefined, 'Expected /tags in OpenAPI paths');
  });

  // 2. Categories API
  console.log(`\n\x1b[34m[2. Categories API - CRUD & RBAC]\x1b[0m`);
  await test('GET /categories returns category list publicly', async () => {
    const res = await request('/categories');
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    assert(Array.isArray(res.data), 'Expected array response');
  });

  await test('POST /categories rejects unauthenticated user (401)', async () => {
    const res = await request('/categories', {
      method: 'POST',
      body: { name: `Cat-${runId}` },
    });
    assert(res.status === 401, `Expected 401, got ${res.status}`);
  });

  await test('POST /categories rejects regular USER (403 Forbidden)', async () => {
    const res = await request('/categories', {
      method: 'POST',
      token: authorToken,
      body: { name: `Cat-${runId}` },
    });
    assert(res.status === 403, `Expected 403, got ${res.status}`);
  });

  await test('POST /categories rejects invalid payload with 400', async () => {
    const res = await request('/categories', {
      method: 'POST',
      token: adminToken,
      body: { name: 'x' }, // Minimum 2 chars
    });
    assert(res.status === 400, `Expected 400, got ${res.status}`);
  });

  await test('POST /categories allows ADMIN to create a category (201)', async () => {
    const res = await request('/categories', {
      method: 'POST',
      token: adminToken,
      body: {
        name: `DevOps Tech ${runId}`,
        description: 'Articles on modern infrastructure',
      },
    });
    assert(res.status === 201, `Expected 201, got ${res.status}`);
    assert(res.data.id !== undefined, 'Expected category ID');
    assert(res.data.slug !== undefined, 'Expected slug to be generated');
    createdCategoryId = res.data.id;
    createdCategorySlug = res.data.slug;
  });

  await test('GET /categories/:id retrieves category by ID', async () => {
    const res = await request(`/categories/${createdCategoryId}`);
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    assert(res.data.id === createdCategoryId, 'Expected matching ID');
  });

  await test('GET /categories/:slug retrieves category by slug', async () => {
    const res = await request(`/categories/${createdCategorySlug}`);
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    assert(res.data.id === createdCategoryId, 'Expected matching category by slug');
  });

  await test('GET /categories?search= filters categories by search term', async () => {
    const res = await request(`/categories?search=${runId}`);
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    assert(res.data.some((c: any) => c.id === createdCategoryId), 'Expected to find category in search');
  });

  await test('PATCH /categories/:id updates category as ADMIN', async () => {
    const res = await request(`/categories/${createdCategoryId}`, {
      method: 'PATCH',
      token: adminToken,
      body: {
        description: 'Updated DevOps description',
      },
    });
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    assert(res.data.description === 'Updated DevOps description', 'Expected updated description');
  });

  // 3. Tags API
  console.log(`\n\x1b[34m[3. Tags API - CRUD & RBAC]\x1b[0m`);
  await test('GET /tags returns tag list publicly', async () => {
    const res = await request('/tags');
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    assert(Array.isArray(res.data), 'Expected array response');
  });

  await test('POST /tags rejects regular USER (403 Forbidden)', async () => {
    const res = await request('/tags', {
      method: 'POST',
      token: authorToken,
      body: { name: `Tag-${runId}` },
    });
    assert(res.status === 403, `Expected 403, got ${res.status}`);
  });

  await test('POST /tags allows ADMIN to create a tag (201)', async () => {
    const res = await request('/tags', {
      method: 'POST',
      token: adminToken,
      body: { name: `Kubernetes-${runId}` },
    });
    assert(res.status === 201, `Expected 201, got ${res.status}`);
    assert(res.data.id !== undefined, 'Expected tag ID');
    assert(res.data.slug !== undefined, 'Expected tag slug');
    createdTagId = res.data.id;
    createdTagSlug = res.data.slug;
  });

  await test('GET /tags/:id retrieves tag by ID', async () => {
    const res = await request(`/tags/${createdTagId}`);
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    assert(res.data.id === createdTagId, 'Expected matching ID');
  });

  await test('GET /tags/:slug retrieves tag by slug', async () => {
    const res = await request(`/tags/${createdTagSlug}`);
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    assert(res.data.id === createdTagId, 'Expected matching tag by slug');
  });

  await test('PATCH /tags/:id updates tag as ADMIN', async () => {
    const res = await request(`/tags/${createdTagId}`, {
      method: 'PATCH',
      token: adminToken,
      body: { name: `K8s-Cluster-${runId}` },
    });
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    assert(res.data.name === `K8s-Cluster-${runId}`, 'Expected updated tag name');
    createdTagSlug = res.data.slug;
  });

  // 4. Posts API
  console.log(`\n\x1b[34m[4. Posts API - Full Lifecycle, RBAC & SEO]\x1b[0m`);
  await test('POST /posts rejects unauthenticated request (401)', async () => {
    const res = await request('/posts', {
      method: 'POST',
      body: { title: 'Unauthorized', content: 'Should fail' },
    });
    assert(res.status === 401, `Expected 401, got ${res.status}`);
  });

  await test('POST /posts rejects invalid payload with 400 (missing content)', async () => {
    const res = await request('/posts', {
      method: 'POST',
      token: authorToken,
      body: { title: 'Missing Content' },
    });
    assert(res.status === 400, `Expected 400, got ${res.status}`);
  });

  await test('POST /posts creates a draft post with relations and SEO fields', async () => {
    const res = await request('/posts', {
      method: 'POST',
      token: authorToken,
      body: {
        title: `Draft Post on Microservices ${runId}`,
        content: 'Comprehensive architectural draft on Fastify and Docker.',
        excerpt: 'Short excerpt for draft.',
        published: false,
        featured: false,
        categories: [createdCategoryId],
        tags: [createdTagId],
        metaTitle: 'Draft Microservices Post',
        metaDescription: 'SEO metadata draft test',
      },
    });
    assert(res.status === 201, `Expected 201, got ${res.status}`);
    assert(res.data.id !== undefined, 'Expected post ID');
    assert(res.data.authorId === testAuthor.id, 'Expected authorId to match token sub');
    assert(res.data.published === false, 'Expected draft post to be unpublished');
    assert(res.data.categories.some((c: any) => c.id === createdCategoryId), 'Expected category relation');
    assert(res.data.tags.some((t: any) => t.id === createdTagId), 'Expected tag relation');
    draftPostId = res.data.id;
  });

  await test('POST /posts creates a published post with slug generation', async () => {
    const res = await request('/posts', {
      method: 'POST',
      token: authorToken,
      body: {
        title: `Comprehensive Guide to API Gateways ${runId}`,
        content: 'Deep dive into Nginx reverse proxying and Fastify services.',
        excerpt: 'Guide to API Gateways',
        published: true,
        featured: true,
        categories: [createdCategorySlug],
        tags: [createdTagId],
        metaTitle: 'API Gateways Guide | GitRabbit',
        metaDescription: 'SEO description for API Gateways',
        canonicalUrl: 'https://gitrabbit.com/blog/api-gateways',
        featuredImage: 'https://example.com/gateway.png',
      },
    });
    assert(res.status === 201, `Expected 201, got ${res.status}`);
    assert(res.data.published === true, 'Expected published post');
    assert(res.data.slug !== undefined, 'Expected generated slug');
    assert(res.data.views === 0, 'Initial views should be 0');
    publishedPostId = res.data.id;
    publishedPostSlug = res.data.slug;
  });

  await test('POST /posts handles slug collisions gracefully with incremented counter', async () => {
    const duplicateTitle = `Collision Test ${runId}`;
    const first = await request('/posts', {
      method: 'POST',
      token: authorToken,
      body: { title: duplicateTitle, content: 'First post content', published: true },
    });
    const second = await request('/posts', {
      method: 'POST',
      token: authorToken,
      body: { title: duplicateTitle, content: 'Second post content', published: true },
    });
    assert(first.status === 201 && second.status === 201, 'Both should succeed');
    assert(first.data.slug !== second.data.slug, 'Slugs must be uniquely distinguished');
    assert(second.data.slug.startsWith(first.data.slug), 'Colliding slug should append counter');
  });

  await test('GET /posts returns published posts with pagination metadata', async () => {
    const res = await request('/posts?page=1&limit=5');
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    assert(Array.isArray(res.data.data), 'Expected array in data field');
    assert(res.data.pagination.page === 1, 'Expected page 1');
    assert(res.data.pagination.limit === 5, 'Expected limit 5');
    assert(res.data.data.every((p: any) => p.published === true), 'Public list should only include published posts');
  });

  await test('GET /posts?category= filters posts by category', async () => {
    const res = await request(`/posts?category=${createdCategorySlug}`);
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    assert(res.data.data.some((p: any) => p.id === publishedPostId), 'Expected published post in filtered results');
  });

  await test('GET /posts?tag= filters posts by tag', async () => {
    const res = await request(`/posts?tag=${createdTagSlug}`);
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    assert(res.data.data.some((p: any) => p.id === publishedPostId), 'Expected published post in filtered results');
  });

  await test('GET /posts?search= searches posts by query term', async () => {
    const res = await request(`/posts?search=${runId}`);
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    assert(res.data.data.some((p: any) => p.id === publishedPostId), 'Expected search to find matching post');
  });

  await test('GET /posts/drafts rejects unauthenticated request (401)', async () => {
    const res = await request('/posts/drafts');
    assert(res.status === 401, `Expected 401, got ${res.status}`);
  });

  await test('GET /posts/drafts returns author drafts when authenticated', async () => {
    const res = await request('/posts/drafts', { token: authorToken });
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    assert(res.data.data.some((p: any) => p.id === draftPostId), 'Author should see own draft post');
    assert(res.data.data.every((p: any) => p.published === false), 'All returned items must be drafts');
  });

  await test('GET /posts/slug/:slug retrieves post and increments view count', async () => {
    const firstGet = await request(`/posts/slug/${publishedPostSlug}`);
    assert(firstGet.status === 200, `Expected 200, got ${firstGet.status}`);
    const v1 = firstGet.data.views;

    const secondGet = await request(`/posts/slug/${publishedPostSlug}`);
    assert(secondGet.status === 200, `Expected 200, got ${secondGet.status}`);
    const v2 = secondGet.data.views;

    assert(v2 === v1 + 1, `View count should increment by 1 (before=${v1}, after=${v2})`);
  });

  await test('GET /posts/slug/:slug returns 404 for nonexistent slug', async () => {
    const res = await request(`/posts/slug/nonexistent-slug-${runId}`);
    assert(res.status === 404, `Expected 404, got ${res.status}`);
  });

  await test('GET /posts/:id allows public access to published post', async () => {
    const res = await request(`/posts/${publishedPostId}`);
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    assert(res.data.id === publishedPostId, 'Expected matching post ID');
  });

  await test('GET /posts/:id forbids anonymous access to draft post (403)', async () => {
    const res = await request(`/posts/${draftPostId}`);
    assert(res.status === 403, `Expected 403, got ${res.status}`);
  });

  await test('GET /posts/:id forbids other non-author user access to draft post (403)', async () => {
    const res = await request(`/posts/${draftPostId}`, { token: otherToken });
    assert(res.status === 403, `Expected 403, got ${res.status}`);
  });

  await test('GET /posts/:id allows author to access draft post (200)', async () => {
    const res = await request(`/posts/${draftPostId}`, { token: authorToken });
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    assert(res.data.id === draftPostId, 'Expected matching draft post');
  });

  await test('PATCH /posts/:id forbids unauthorized user from updating post (403)', async () => {
    const res = await request(`/posts/${draftPostId}`, {
      method: 'PATCH',
      token: otherToken,
      body: { title: 'Hacked Title' },
    });
    assert(res.status === 403, `Expected 403, got ${res.status}`);
  });

  await test('PATCH /posts/:id allows author to update their own post (200)', async () => {
    const res = await request(`/posts/${draftPostId}`, {
      method: 'PATCH',
      token: authorToken,
      body: {
        title: `Updated Draft Title ${runId}`,
        excerpt: 'Updated excerpt by author',
      },
    });
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    assert(res.data.title === `Updated Draft Title ${runId}`, 'Expected updated title');
    assert(res.data.excerpt === 'Updated excerpt by author', 'Expected updated excerpt');
  });

  await test('PATCH /posts/:id/publish toggles published state (publish draft)', async () => {
    const res = await request(`/posts/${draftPostId}/publish`, {
      method: 'PATCH',
      token: authorToken,
      body: { published: true },
    });
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    assert(res.data.published === true, 'Post should now be published');
  });

  await test('PATCH /posts/:id/publish toggles published state (unpublish post)', async () => {
    const res = await request(`/posts/${draftPostId}/publish`, {
      method: 'PATCH',
      token: authorToken,
      body: { published: false },
    });
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    assert(res.data.published === false, 'Post should now be draft');
  });

  await test('PATCH /posts/:id allows ADMIN to update any post (200)', async () => {
    const res = await request(`/posts/${draftPostId}`, {
      method: 'PATCH',
      token: adminToken,
      body: { metaTitle: 'Admin Supervised Post' },
    });
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    assert(res.data.metaTitle === 'Admin Supervised Post', 'Expected admin update');
  });

  await test('DELETE /posts/:id forbids unauthorized user from deleting post (403)', async () => {
    const res = await request(`/posts/${draftPostId}`, {
      method: 'DELETE',
      token: otherToken,
    });
    assert(res.status === 403, `Expected 403, got ${res.status}`);
  });

  await test('DELETE /posts/:id allows author to delete own post (200)', async () => {
    const res = await request(`/posts/${draftPostId}`, {
      method: 'DELETE',
      token: authorToken,
    });
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    assert(res.data.success === true, 'Expected success response');
  });

  await test('DELETE /posts/:id allows ADMIN to delete any post (200)', async () => {
    const res = await request(`/posts/${publishedPostId}`, {
      method: 'DELETE',
      token: adminToken,
    });
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    assert(res.data.success === true, 'Expected success response');
  });

  // 5. Cleanup Tag and Category
  console.log(`\n\x1b[34m[5. Cleanup & Teardown]\x1b[0m`);
  await test('DELETE /tags/:id deletes tag as ADMIN (200)', async () => {
    const res = await request(`/tags/${createdTagId}`, {
      method: 'DELETE',
      token: adminToken,
    });
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    assert(res.data.success === true, 'Expected success response');
  });

  await test('DELETE /categories/:id deletes category as ADMIN (200)', async () => {
    const res = await request(`/categories/${createdCategoryId}`, {
      method: 'DELETE',
      token: adminToken,
    });
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    assert(res.data.success === true, 'Expected success response');
  });

  // Summary
  console.log(`\n======================================================`);
  console.log(`  E2E TEST SUMMARY`);
  console.log(`  Passed: \x1b[32m${passedTests}\x1b[0m`);
  console.log(`  Failed: \x1b[31m${failedTests}\x1b[0m`);
  console.log(`  Total:  ${passedTests + failedTests}`);
  console.log(`======================================================\n`);

  if (failedTests > 0) {
    process.exit(1);
  }
}

runAllE2ETests().catch((err) => {
  console.error('Fatal E2E test failure:', err);
  process.exit(1);
});
