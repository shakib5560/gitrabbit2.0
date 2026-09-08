import { FastifyInstance } from 'fastify';
import { tagsController } from './tags.controller';
import {
  createTagSchema,
  deleteTagSchema,
  getTagSchema,
  listTagsSchema,
  updateTagSchema,
} from './tags.schema';
import { authenticate } from '../../auth/jwt.guard';
import { requireAdmin } from '../../auth/roles.guard';

export async function tagRoutes(fastify: FastifyInstance) {
  fastify.get<{ Querystring: { search?: string } }>('/tags', { schema: listTagsSchema }, tagsController.list);

  fastify.get<{ Params: { id: string } }>('/tags/:id', { schema: getTagSchema }, tagsController.getOne);

  fastify.post<{ Body: { name: string; slug?: string } }>(
    '/tags',
    {
      schema: createTagSchema,
      preHandler: [authenticate, requireAdmin],
    },
    tagsController.create,
  );

  fastify.patch<{
    Params: { id: string };
    Body: { name?: string; slug?: string };
  }>(
    '/tags/:id',
    {
      schema: updateTagSchema,
      preHandler: [authenticate, requireAdmin],
    },
    tagsController.update,
  );

  fastify.delete<{ Params: { id: string } }>(
    '/tags/:id',
    {
      schema: deleteTagSchema,
      preHandler: [authenticate, requireAdmin],
    },
    tagsController.delete,
  );
}
