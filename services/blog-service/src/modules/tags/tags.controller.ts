import { FastifyReply, FastifyRequest } from 'fastify';
import { tagsService } from './tags.service';

export class TagsController {
  async create(request: FastifyRequest<{ Body: { name: string; slug?: string } }>, reply: FastifyReply) {
    const tag = await tagsService.createTag(request.body);
    return reply.status(201).send(tag);
  }

  async list(request: FastifyRequest<{ Querystring: { search?: string } }>, reply: FastifyReply) {
    const tags = await tagsService.listTags(request.query.search);
    return reply.status(200).send(tags);
  }

  async getOne(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const tag = await tagsService.getTagByIdOrSlug(request.params.id);
    return reply.status(200).send(tag);
  }

  async update(
    request: FastifyRequest<{
      Params: { id: string };
      Body: { name?: string; slug?: string };
    }>,
    reply: FastifyReply,
  ) {
    const tag = await tagsService.updateTag(request.params.id, request.body);
    return reply.status(200).send(tag);
  }

  async delete(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const result = await tagsService.deleteTag(request.params.id);
    return reply.status(200).send(result);
  }
}

export const tagsController = new TagsController();
