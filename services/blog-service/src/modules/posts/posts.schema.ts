import { FastifySchema } from 'fastify';

const postResponseProperties = {
  id: { type: 'string', format: 'uuid' },
  authorId: { type: 'string' },
  title: { type: 'string' },
  slug: { type: 'string' },
  content: { type: 'string' },
  excerpt: { type: ['string', 'null'] },
  published: { type: 'boolean' },
  featured: { type: 'boolean' },
  views: { type: 'integer' },
  metaTitle: { type: ['string', 'null'] },
  metaDescription: { type: ['string', 'null'] },
  canonicalUrl: { type: ['string', 'null'] },
  featuredImage: { type: ['string', 'null'] },
  ogTitle: { type: ['string', 'null'] },
  ogDescription: { type: ['string', 'null'] },
  ogImage: { type: ['string', 'null'] },
  createdAt: { type: 'string', format: 'date-time' },
  updatedAt: { type: 'string', format: 'date-time' },
  categories: {
    type: 'array',
    items: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        slug: { type: 'string' },
      },
    },
  },
  tags: {
    type: 'array',
    items: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        slug: { type: 'string' },
      },
    },
  },
};

export const createPostSchema: FastifySchema = {
  tags: ['Posts'],
  summary: 'Create a new blog post',
  description: 'Creates a new post. Authenticated user from Auth Service is assigned as author.',
  security: [{ bearerAuth: [] }],
  body: {
    type: 'object',
    required: ['title', 'content'],
    properties: {
      title: { type: 'string', minLength: 3, maxLength: 255 },
      slug: { type: 'string', minLength: 3, maxLength: 255 },
      content: { type: 'string', minLength: 5 },
      excerpt: { type: 'string', maxLength: 500 },
      published: { type: 'boolean', default: false },
      featured: { type: 'boolean', default: false },
      categories: {
        type: 'array',
        items: { type: 'string' },
        description: 'Array of Category IDs or slugs to associate',
      },
      tags: {
        type: 'array',
        items: { type: 'string' },
        description: 'Array of Tag IDs or slugs to associate',
      },
      metaTitle: { type: 'string', maxLength: 150 },
      metaDescription: { type: 'string', maxLength: 300 },
      canonicalUrl: { type: 'string', format: 'uri' },
      featuredImage: { type: 'string', format: 'uri' },
      ogTitle: { type: 'string', maxLength: 150 },
      ogDescription: { type: 'string', maxLength: 300 },
      ogImage: { type: 'string', format: 'uri' },
    },
  },
  response: {
    201: {
      type: 'object',
      properties: postResponseProperties,
    },
  },
};

export const listPostsSchema: FastifySchema = {
  tags: ['Posts'],
  summary: 'List published posts with pagination, search, and filtering',
  description:
    'Retrieves paginated posts. By default returns published posts. Can filter by category, tag, author, search query, featured flag, and sort fields.',
  querystring: {
    type: 'object',
    properties: {
      page: { type: 'integer', default: 1, minimum: 1 },
      limit: { type: 'integer', default: 10, minimum: 1, maximum: 100 },
      search: { type: 'string', description: 'Search term across title, content, excerpt' },
      category: { type: 'string', description: 'Category ID or slug' },
      tag: { type: 'string', description: 'Tag ID or slug' },
      authorId: { type: 'string', description: 'Author user ID from Auth Service' },
      featured: { type: 'boolean', description: 'Filter by featured flag' },
      published: { type: 'boolean', description: 'Filter by published flag' },
      sortBy: { type: 'string', enum: ['createdAt', 'views', 'title'], default: 'createdAt' },
      sortOrder: { type: 'string', enum: ['asc', 'desc'], default: 'desc' },
    },
  },
  response: {
    200: {
      type: 'object',
      properties: {
        data: {
          type: 'array',
          items: {
            type: 'object',
            properties: postResponseProperties,
          },
        },
        pagination: {
          type: 'object',
          properties: {
            total: { type: 'integer' },
            page: { type: 'integer' },
            limit: { type: 'integer' },
            totalPages: { type: 'integer' },
            hasNextPage: { type: 'boolean' },
            hasPrevPage: { type: 'boolean' },
          },
        },
      },
    },
  },
};

export const getDraftsSchema: FastifySchema = {
  tags: ['Posts'],
  summary: 'List draft posts (Author or Admin)',
  description:
    'Retrieves draft posts for the authenticated author, or all drafts if the requester is an ADMIN.',
  security: [{ bearerAuth: [] }],
  querystring: {
    type: 'object',
    properties: {
      page: { type: 'integer', default: 1, minimum: 1 },
      limit: { type: 'integer', default: 10, minimum: 1, maximum: 100 },
    },
  },
  response: {
    200: {
      type: 'object',
      properties: {
        data: {
          type: 'array',
          items: {
            type: 'object',
            properties: postResponseProperties,
          },
        },
        pagination: {
          type: 'object',
          properties: {
            total: { type: 'integer' },
            page: { type: 'integer' },
            limit: { type: 'integer' },
            totalPages: { type: 'integer' },
            hasNextPage: { type: 'boolean' },
            hasPrevPage: { type: 'boolean' },
          },
        },
      },
    },
  },
};

export const getPostByIdSchema: FastifySchema = {
  tags: ['Posts'],
  summary: 'Get post by ID',
  description: 'Retrieves a single post by ID. Published posts are public; drafts require author or admin.',
  params: {
    type: 'object',
    required: ['id'],
    properties: {
      id: { type: 'string', format: 'uuid' },
    },
  },
  response: {
    200: {
      type: 'object',
      properties: postResponseProperties,
    },
  },
};

export const getPostBySlugSchema: FastifySchema = {
  tags: ['Posts'],
  summary: 'Get post by slug (increments view count)',
  description:
    'Retrieves a post by unique slug and automatically increments its view count. Published posts are public.',
  params: {
    type: 'object',
    required: ['slug'],
    properties: {
      slug: { type: 'string' },
    },
  },
  response: {
    200: {
      type: 'object',
      properties: postResponseProperties,
    },
  },
};

export const updatePostSchema: FastifySchema = {
  tags: ['Posts'],
  summary: 'Update post (Author or Admin)',
  description: 'Updates a post. Can only be performed by the post author or an ADMIN.',
  security: [{ bearerAuth: [] }],
  params: {
    type: 'object',
    required: ['id'],
    properties: {
      id: { type: 'string', format: 'uuid' },
    },
  },
  body: {
    type: 'object',
    properties: {
      title: { type: 'string', minLength: 3, maxLength: 255 },
      slug: { type: 'string', minLength: 3, maxLength: 255 },
      content: { type: 'string', minLength: 5 },
      excerpt: { type: 'string', maxLength: 500 },
      published: { type: 'boolean' },
      featured: { type: 'boolean' },
      categories: {
        type: 'array',
        items: { type: 'string' },
      },
      tags: {
        type: 'array',
        items: { type: 'string' },
      },
      metaTitle: { type: 'string', maxLength: 150 },
      metaDescription: { type: 'string', maxLength: 300 },
      canonicalUrl: { type: 'string', format: 'uri' },
      featuredImage: { type: 'string', format: 'uri' },
      ogTitle: { type: 'string', maxLength: 150 },
      ogDescription: { type: 'string', maxLength: 300 },
      ogImage: { type: 'string', format: 'uri' },
    },
  },
  response: {
    200: {
      type: 'object',
      properties: postResponseProperties,
    },
  },
};

export const publishPostSchema: FastifySchema = {
  tags: ['Posts'],
  summary: 'Publish or unpublish post (Author or Admin)',
  description: 'Sets the published status of a post.',
  security: [{ bearerAuth: [] }],
  params: {
    type: 'object',
    required: ['id'],
    properties: {
      id: { type: 'string', format: 'uuid' },
    },
  },
  body: {
    type: 'object',
    required: ['published'],
    properties: {
      published: { type: 'boolean' },
    },
  },
  response: {
    200: {
      type: 'object',
      properties: postResponseProperties,
    },
  },
};

export const deletePostSchema: FastifySchema = {
  tags: ['Posts'],
  summary: 'Delete post (Author or Admin)',
  description: 'Deletes a post. Can only be performed by the post author or an ADMIN.',
  security: [{ bearerAuth: [] }],
  params: {
    type: 'object',
    required: ['id'],
    properties: {
      id: { type: 'string', format: 'uuid' },
    },
  },
  response: {
    200: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        message: { type: 'string' },
      },
    },
  },
};
