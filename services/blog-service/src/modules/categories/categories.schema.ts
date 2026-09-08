import { FastifySchema } from 'fastify';

const categoryResponseProperties = {
  id: { type: 'string', format: 'uuid' },
  name: { type: 'string' },
  slug: { type: 'string' },
  description: { type: ['string', 'null'] },
  createdAt: { type: 'string', format: 'date-time' },
  updatedAt: { type: 'string', format: 'date-time' },
  _count: {
    type: 'object',
    properties: {
      posts: { type: 'integer' },
    },
  },
};

export const createCategorySchema: FastifySchema = {
  tags: ['Categories'],
  summary: 'Create a new category (Admin only)',
  description: 'Creates a new blog category. Requires ADMIN role from Auth Service.',
  security: [{ bearerAuth: [] }],
  body: {
    type: 'object',
    required: ['name'],
    properties: {
      name: { type: 'string', minLength: 2, maxLength: 100 },
      slug: { type: 'string', minLength: 2, maxLength: 120 },
      description: { type: 'string', maxLength: 500 },
    },
  },
  response: {
    201: {
      type: 'object',
      properties: categoryResponseProperties,
    },
  },
};

export const listCategoriesSchema: FastifySchema = {
  tags: ['Categories'],
  summary: 'List categories',
  description: 'Retrieves a list of blog categories with associated post counts.',
  querystring: {
    type: 'object',
    properties: {
      search: { type: 'string' },
    },
  },
  response: {
    200: {
      type: 'array',
      items: {
        type: 'object',
        properties: categoryResponseProperties,
      },
    },
  },
};

export const getCategorySchema: FastifySchema = {
  tags: ['Categories'],
  summary: 'Get category by ID or slug',
  description: 'Retrieves a specific category and its published posts.',
  params: {
    type: 'object',
    required: ['id'],
    properties: {
      id: { type: 'string' },
    },
  },
  response: {
    200: {
      type: 'object',
      properties: {
        ...categoryResponseProperties,
        posts: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              title: { type: 'string' },
              slug: { type: 'string' },
              excerpt: { type: ['string', 'null'] },
              createdAt: { type: 'string', format: 'date-time' },
            },
          },
        },
      },
    },
  },
};

export const updateCategorySchema: FastifySchema = {
  tags: ['Categories'],
  summary: 'Update category (Admin only)',
  description: 'Updates an existing category. Requires ADMIN role from Auth Service.',
  security: [{ bearerAuth: [] }],
  params: {
    type: 'object',
    required: ['id'],
    properties: {
      id: { type: 'string' },
    },
  },
  body: {
    type: 'object',
    properties: {
      name: { type: 'string', minLength: 2, maxLength: 100 },
      slug: { type: 'string', minLength: 2, maxLength: 120 },
      description: { type: 'string', maxLength: 500 },
    },
  },
  response: {
    200: {
      type: 'object',
      properties: categoryResponseProperties,
    },
  },
};

export const deleteCategorySchema: FastifySchema = {
  tags: ['Categories'],
  summary: 'Delete category (Admin only)',
  description: 'Deletes a category. Requires ADMIN role from Auth Service.',
  security: [{ bearerAuth: [] }],
  params: {
    type: 'object',
    required: ['id'],
    properties: {
      id: { type: 'string' },
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
