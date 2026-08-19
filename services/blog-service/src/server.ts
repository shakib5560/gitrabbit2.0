import Fastify from 'fastify';
import { PrismaClient } from '@prisma/client';
import fastifyJwt from '@fastify/jwt';

const fastify = Fastify({ logger: true });
const prisma = new PrismaClient();

fastify.register(fastifyJwt, {
  secret: process.env.JWT_SECRET || 'super_secret_jwt_key'
});

fastify.decorate("authenticate", async function(request: any, reply: any) {
  try {
    await request.jwtVerify();
  } catch (err) {
    reply.send(err);
  }
});

fastify.get('/health', async (request, reply) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { status: 'ok', service: 'blog-service', database: 'connected' };
  } catch (error) {
    fastify.log.error(error);
    reply.status(500).send({ status: 'error', service: 'blog-service', database: 'disconnected' });
  }
});

const start = async () => {
  try {
    const port = parseInt(process.env.PORT || '4000', 10);
    await fastify.listen({ port, host: '0.0.0.0' });
    fastify.log.info(`Blog Service listening on port ${port}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
