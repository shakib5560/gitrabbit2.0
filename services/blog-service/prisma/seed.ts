import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding Blog Service database...');

  // Create Categories
  const engineering = await prisma.category.upsert({
    where: { slug: 'engineering' },
    update: {},
    create: {
      name: 'Engineering',
      slug: 'engineering',
      description: 'Technical deep-dives, software engineering patterns, and best practices.',
    },
  });

  const devops = await prisma.category.upsert({
    where: { slug: 'devops' },
    update: {},
    create: {
      name: 'DevOps',
      slug: 'devops',
      description: 'Containerization, CI/CD pipelines, and cloud infrastructure.',
    },
  });

  const ai = await prisma.category.upsert({
    where: { slug: 'ai-machine-learning' },
    update: {},
    create: {
      name: 'AI & Machine Learning',
      slug: 'ai-machine-learning',
      description: 'Artificial intelligence, LLMs, and agentic workflows.',
    },
  });

  // Create Tags
  const tsTag = await prisma.tag.upsert({
    where: { slug: 'typescript' },
    update: {},
    create: { name: 'TypeScript', slug: 'typescript' },
  });

  const fastifyTag = await prisma.tag.upsert({
    where: { slug: 'fastify' },
    update: {},
    create: { name: 'Fastify', slug: 'fastify' },
  });

  const microservicesTag = await prisma.tag.upsert({
    where: { slug: 'microservices' },
    update: {},
    create: { name: 'Microservices', slug: 'microservices' },
  });

  const dockerTag = await prisma.tag.upsert({
    where: { slug: 'docker' },
    update: {},
    create: { name: 'Docker', slug: 'docker' },
  });

  // Seed sample post
  const sampleAuthorId = '00000000-0000-0000-0000-000000000001';

  await prisma.post.upsert({
    where: { slug: 'building-microservices-with-fastify-and-typescript' },
    update: {},
    create: {
      title: 'Building Microservices with Fastify and TypeScript',
      slug: 'building-microservices-with-fastify-and-typescript',
      content:
        'Fastify is a high-performance web framework for Node.js focused on providing the best developer experience with the least overhead. In this article, we explore building microservices with Fastify and TypeScript.',
      excerpt: 'Learn how to build scalable microservices using Fastify, TypeScript, and Prisma.',
      published: true,
      featured: true,
      views: 42,
      authorId: sampleAuthorId,
      metaTitle: 'Building Microservices with Fastify and TypeScript | GitRabbit',
      metaDescription: 'A comprehensive guide to building scalable, production-ready microservices with Fastify and TypeScript.',
      canonicalUrl: 'https://gitrabbit.com/blog/building-microservices-with-fastify-and-typescript',
      featuredImage: 'https://images.unsplash.com/photo-1555066931-4365d14bab8c',
      ogTitle: 'Building Microservices with Fastify and TypeScript',
      ogDescription: 'A comprehensive guide to building scalable microservices.',
      categories: {
        connect: [{ id: engineering.id }, { id: devops.id }],
      },
      tags: {
        connect: [{ id: tsTag.id }, { id: fastifyTag.id }, { id: microservicesTag.id }, { id: dockerTag.id }],
      },
    },
  });

  // Seed a draft post
  await prisma.post.upsert({
    where: { slug: 'upcoming-features-in-gitrabbit-v2' },
    update: {},
    create: {
      title: 'Upcoming Features in GitRabbit v2',
      slug: 'upcoming-features-in-gitrabbit-v2',
      content: 'Here is an internal preview of upcoming features planned for GitRabbit v2...',
      excerpt: 'Preview of upcoming GitRabbit v2 features.',
      published: false,
      featured: false,
      authorId: sampleAuthorId,
      metaTitle: 'Upcoming Features in GitRabbit v2',
      categories: {
        connect: [{ id: engineering.id }],
      },
      tags: {
        connect: [{ id: tsTag.id }],
      },
    },
  });

  console.log('Seeding completed successfully.');
}

main()
  .catch((e) => {
    console.error('Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
