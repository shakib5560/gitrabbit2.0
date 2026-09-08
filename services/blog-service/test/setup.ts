import { buildApp } from '../src/app';
import { prisma } from '../src/database/prisma';
import { FastifyInstance } from 'fastify';

export const testUser = {
  id: '11111111-1111-1111-1111-111111111111',
  email: 'author@gitrabbit.com',
  role: 'USER' as const,
};

export const anotherUser = {
  id: '22222222-2222-2222-2222-222222222222',
  email: 'other@gitrabbit.com',
  role: 'USER' as const,
};

export const adminUser = {
  id: '33333333-3333-3333-3333-333333333333',
  email: 'admin@gitrabbit.com',
  role: 'ADMIN' as const,
};

export let app: FastifyInstance;

export async function initTestApp(): Promise<FastifyInstance> {
  app = buildApp();
  await app.ready();
  return app;
}

export function generateToken(
  user: { id: string; email: string; role: 'USER' | 'ADMIN' | string },
  customApp?: FastifyInstance,
): string {
  const instance = customApp || app;
  return instance.jwt.sign({
    sub: user.id,
    email: user.email,
    role: user.role,
  });
}

export async function closeTestApp(): Promise<void> {
  if (app) {
    await app.close();
  }
  await prisma.$disconnect();
}
