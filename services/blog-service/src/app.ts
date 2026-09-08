import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import fastifyJwt from '@fastify/jwt';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
import { config } from './config/env';
import { prisma } from './database/prisma';
import { postRoutes } from './modules/posts/posts.routes';
import { categoryRoutes } from './modules/categories/categories.routes';
import { tagRoutes } from './modules/tags/tags.routes';
import { AppError } from './common/errors/app-error';

export function buildApp(opts = {}): FastifyInstance {
  const app = Fastify({
    logger: config.nodeEnv === 'test' ? false : true,
    ...opts,
  });

  // CORS
  app.register(cors, {
    origin: true,
    credentials: true,
  });

  // JWT Verification (from Auth Service)
  app.register(fastifyJwt, {
    secret: config.jwtSecret,
  });

  // Swagger OpenAPI Documentation
  app.register(fastifySwagger, {
    openapi: {
      info: {
        title: 'GitRabbit Blog Service API',
        description:
          'High-performance production-ready Blog Service for GitRabbit microservices architecture. Downstream consumer of Auth Service identities.',
        version: '1.0.0',
      },
      servers: [
        {
          url: 'http://localhost:4000',
          description: 'Direct Local Service',
        },
        {
          url: 'http://localhost:80/api/blog',
          description: 'Via API Gateway',
        },
      ],
      tags: [
        { name: 'Posts', description: 'Blog posts and article management' },
        { name: 'Categories', description: 'Blog categorization and organization' },
        { name: 'Tags', description: 'Tagging and metadata categorization' },
        { name: 'System', description: 'Health and service telemetry' },
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
            description: 'Provide the JWT token obtained from Auth Service (/api/auth/login)',
          },
        },
      },
    },
  });

  // Swagger UI
  app.register(fastifySwaggerUi, {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: true,
    },
    staticCSP: true,
    transformStaticCSP: (header) => header,
  });

  // Health Endpoint
  app.get(
    '/health',
    {
      schema: {
        tags: ['System'],
        summary: 'Service health check',
        description: 'Verifies Blog Service status and PostgreSQL database connection.',
        response: {
          200: {
            type: 'object',
            properties: {
              status: { type: 'string' },
              service: { type: 'string' },
              database: { type: 'string' },
              timestamp: { type: 'string', format: 'date-time' },
            },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        await prisma.$queryRaw`SELECT 1`;
        return {
          status: 'ok',
          service: 'blog-service',
          database: 'connected',
          timestamp: new Date().toISOString(),
        };
      } catch (error: any) {
        app.log.error(error);
        return reply.status(503).send({
          status: 'error',
          service: 'blog-service',
          database: 'disconnected',
          message: error.message,
          timestamp: new Date().toISOString(),
        });
      }
    },
  );

  // Register Modules
  app.register(postRoutes);
  app.register(categoryRoutes);
  app.register(tagRoutes);

  // Global Error Handler
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({
        statusCode: error.statusCode,
        error: error.name,
        message: error.message,
      });
    }

    if (error.validation) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: error.message,
        validation: error.validation,
      });
    }

    const statusCode = error.statusCode || 500;
    app.log.error(error);

    return reply.status(statusCode).send({
      statusCode,
      error: error.name || 'InternalServerError',
      message: config.nodeEnv === 'production' && statusCode === 500 ? 'Internal server error' : error.message,
    });
  });

  return app;
}
