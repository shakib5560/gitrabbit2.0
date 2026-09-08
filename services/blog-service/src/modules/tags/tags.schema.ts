import { FastifySchema } from 'fastify';

const tagResponseProperties = {
  id: { type: 'string', format: 'uuid' },
  name: { type: 'string' },
  slug: { type: 'string' },
  createdAt: { type: 'string', format: 'date-time' },
  updatedAt: { type: 'string', format: 'date-time' },
  _count: {
    type: 'object',
    properties: {
      posts: { type: 'integer' },
    },
  },
};

export const createTagSchema: FastifySchema = {
  tags: ['Tags'],
  summary: 'Create a new tag (Admin only)',
  description: 'Creates a new tag for blog posts. Requires ADMIN role from Auth Service.',
  security: [{ bearerAuth: [] }],
  body: {
    type: 'object',
    required: ['name'],
    properties: {
      name: { type: 'string', minLength: 2, maxLength: 50 },
      slug: { type: 'string', minLength: 2, maxLength: 60 },
    },
  },
  response: {
    201: {
      type: 'object',
      properties: tagResponseProperties,
    },
  },
};

export const listTagsSchema: FastifySchema = {
  tags: ['Tags'],
  summary: 'List tags',
  description: 'Retrieves all blog tags with post count.',
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
        properties: tagResponseProperties,
      },
    },
  },
};

export const getTagSchema: FastifySchema = {
  tags: ['Tags'],
  summary: 'Get tag by ID or slug',
  description: 'Retrieves a single tag and its published posts.',
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
        ...tagResponseProperties,
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

export const updateTagSchema: FastifySchema = {
  tags: ['Tags'],
  summary: 'Update tag (Admin only)',
  description: 'Updates a tag name or slug. Requires ADMIN role from Auth Service.',
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
      name: { type: 'string', minLength: 2, maxLength: 50 },
      slug: { type: 'string', minLength: 2, maxLength: 60 },
    },
  },
  response: {
    200: {
      type: 'object',
      properties: tagResponseProperties,
    },
  },
};

export const deleteTagSchema: FastifySchema = {
  tags: ['Tags'],
  summary: 'Delete tag (Admin only)',
  description: 'Deletes a tag. Requires ADMIN role from Auth Service.',
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
