import { FastifyInstance } from 'fastify';
import { postsController } from './posts.controller';
import {
  createPostSchema,
  deletePostSchema,
  getDraftsSchema,
  getPostByIdSchema,
  getPostBySlugSchema,
  listPostsSchema,
  publishPostSchema,
  updatePostSchema,
} from './posts.schema';
import { CreatePostDto, ListPostsQuery, UpdatePostDto } from './posts.service';
import { authenticate, optionalAuthenticate } from '../../auth/jwt.guard';

export async function postRoutes(fastify: FastifyInstance) {
  // Public list (supports published/filter queries; draft access requires auth)
  fastify.get<{ Querystring: ListPostsQuery }>(
    '/posts',
    { schema: listPostsSchema, preHandler: [optionalAuthenticate] },
    postsController.list,
  );

  // Authenticated drafts endpoint
  fastify.get<{ Querystring: { page?: number; limit?: number } }>(
    '/posts/drafts',
    { schema: getDraftsSchema, preHandler: [authenticate] },
    postsController.getDrafts,
  );

  // Get by slug (increments view count, public for published)
  fastify.get<{ Params: { slug: string } }>(
    '/posts/slug/:slug',
    { schema: getPostBySlugSchema, preHandler: [optionalAuthenticate] },
    postsController.getBySlug,
  );

  // Get by ID
  fastify.get<{ Params: { id: string } }>(
    '/posts/:id',
    { schema: getPostByIdSchema, preHandler: [optionalAuthenticate] },
    postsController.getById,
  );

  // Create post (Authenticated)
  fastify.post<{ Body: CreatePostDto }>(
    '/posts',
    { schema: createPostSchema, preHandler: [authenticate] },
    postsController.create,
  );

  // Update post (Author or Admin)
  fastify.patch<{ Params: { id: string }; Body: UpdatePostDto }>(
    '/posts/:id',
    { schema: updatePostSchema, preHandler: [authenticate] },
    postsController.update,
  );

  // Toggle/set publish status (Author or Admin)
  fastify.patch<{ Params: { id: string }; Body: { published: boolean } }>(
    '/posts/:id/publish',
    { schema: publishPostSchema, preHandler: [authenticate] },
    postsController.setPublish,
  );

  // Delete post (Author or Admin)
  fastify.delete<{ Params: { id: string } }>(
    '/posts/:id',
    { schema: deletePostSchema, preHandler: [authenticate] },
    postsController.delete,
  );
}
