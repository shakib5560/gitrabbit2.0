import { FastifyReply, FastifyRequest } from 'fastify';
import { categoriesService } from './categories.service';

export class CategoriesController {
  async create(request: FastifyRequest<{ Body: { name: string; slug?: string; description?: string } }>, reply: FastifyReply) {
    const category = await categoriesService.createCategory(request.body);
    return reply.status(201).send(category);
  }

  async list(request: FastifyRequest<{ Querystring: { search?: string } }>, reply: FastifyReply) {
    const categories = await categoriesService.listCategories(request.query.search);
    return reply.status(200).send(categories);
  }

  async getOne(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const category = await categoriesService.getCategoryByIdOrSlug(request.params.id);
    return reply.status(200).send(category);
  }

  async update(
    request: FastifyRequest<{
      Params: { id: string };
      Body: { name?: string; slug?: string; description?: string };
    }>,
    reply: FastifyReply,
  ) {
    const category = await categoriesService.updateCategory(request.params.id, request.body);
    return reply.status(200).send(category);
  }

  async delete(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const result = await categoriesService.deleteCategory(request.params.id);
    return reply.status(200).send(result);
  }
}

export const categoriesController = new CategoriesController();
