import { FastifyInstance } from 'fastify';
import { categoriesController } from './categories.controller';
import {
  createCategorySchema,
  deleteCategorySchema,
  getCategorySchema,
  listCategoriesSchema,
  updateCategorySchema,
} from './categories.schema';
import { authenticate } from '../../auth/jwt.guard';
import { requireAdmin } from '../../auth/roles.guard';

export async function categoryRoutes(fastify: FastifyInstance) {
  fastify.get<{ Querystring: { search?: string } }>(
    '/categories',
    { schema: listCategoriesSchema },
    categoriesController.list,
  );

  fastify.get<{ Params: { id: string } }>(
    '/categories/:id',
    { schema: getCategorySchema },
    categoriesController.getOne,
  );

  fastify.post<{ Body: { name: string; slug?: string; description?: string } }>(
    '/categories',
    {
      schema: createCategorySchema,
      preHandler: [authenticate, requireAdmin],
    },
    categoriesController.create,
  );

  fastify.patch<{
    Params: { id: string };
    Body: { name?: string; slug?: string; description?: string };
  }>(
    '/categories/:id',
    {
      schema: updateCategorySchema,
      preHandler: [authenticate, requireAdmin],
    },
    categoriesController.update,
  );

  fastify.delete<{ Params: { id: string } }>(
    '/categories/:id',
    {
      schema: deleteCategorySchema,
      preHandler: [authenticate, requireAdmin],
    },
    categoriesController.delete,
  );
}
