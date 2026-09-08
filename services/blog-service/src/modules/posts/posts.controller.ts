import { FastifyReply, FastifyRequest } from 'fastify';
import { postsService, CreatePostDto, ListPostsQuery, UpdatePostDto } from './posts.service';

export class PostsController {
  async create(request: FastifyRequest<{ Body: CreatePostDto }>, reply: FastifyReply) {
    const authorId = request.user!.id;
    const post = await postsService.createPost(request.body, authorId);
    return reply.status(201).send(post);
  }

  async list(request: FastifyRequest<{ Querystring: ListPostsQuery }>, reply: FastifyReply) {
    const result = await postsService.listPosts(request.query, request.user);
    return reply.status(200).send(result);
  }

  async getDrafts(
    request: FastifyRequest<{ Querystring: { page?: number; limit?: number } }>,
    reply: FastifyReply,
  ) {
    const result = await postsService.getDrafts(request.query, request.user!);
    return reply.status(200).send(result);
  }

  async getById(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const post = await postsService.getPostById(request.params.id, request.user);
    return reply.status(200).send(post);
  }

  async getBySlug(request: FastifyRequest<{ Params: { slug: string } }>, reply: FastifyReply) {
    const post = await postsService.getPostBySlug(request.params.slug, request.user);
    return reply.status(200).send(post);
  }

  async update(
    request: FastifyRequest<{ Params: { id: string }; Body: UpdatePostDto }>,
    reply: FastifyReply,
  ) {
    const post = await postsService.updatePost(request.params.id, request.body, request.user!);
    return reply.status(200).send(post);
  }

  async setPublish(
    request: FastifyRequest<{ Params: { id: string }; Body: { published: boolean } }>,
    reply: FastifyReply,
  ) {
    const post = await postsService.setPublishStatus(
      request.params.id,
      request.body.published,
      request.user!,
    );
    return reply.status(200).send(post);
  }

  async delete(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const result = await postsService.deletePost(request.params.id, request.user!);
    return reply.status(200).send(result);
  }
}

export const postsController = new PostsController();
