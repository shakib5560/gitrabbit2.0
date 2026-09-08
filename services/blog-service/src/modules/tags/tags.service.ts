import { prisma } from '../../database/prisma';
import { ConflictError, NotFoundError } from '../../common/errors/app-error';
import { createSlug, generateUniqueSlug } from '../../common/utils/slug';

export class TagsService {
  async createTag(data: { name: string; slug?: string }) {
    const existingByName = await prisma.tag.findUnique({
      where: { name: data.name },
    });
    if (existingByName) {
      throw new ConflictError(`Tag with name "${data.name}" already exists`);
    }

    const slug = await generateUniqueSlug(
      data.name,
      async (s) => !!(await prisma.tag.findUnique({ where: { slug: s } })),
      data.slug,
    );

    return prisma.tag.create({
      data: {
        name: data.name,
        slug,
      },
      include: {
        _count: {
          select: { posts: true },
        },
      },
    });
  }

  async listTags(search?: string) {
    const where: any = {};
    if (search) {
      where.name = { contains: search, mode: 'insensitive' };
    }

    return prisma.tag.findMany({
      where,
      orderBy: { name: 'asc' },
      include: {
        _count: {
          select: { posts: true },
        },
      },
    });
  }

  async getTagByIdOrSlug(idOrSlug: string) {
    const tag = await prisma.tag.findFirst({
      where: {
        OR: [{ id: idOrSlug }, { slug: idOrSlug }],
      },
      include: {
        _count: {
          select: { posts: true },
        },
        posts: {
          where: { published: true },
          select: {
            id: true,
            title: true,
            slug: true,
            excerpt: true,
            createdAt: true,
          },
          take: 20,
        },
      },
    });

    if (!tag) {
      throw new NotFoundError(`Tag "${idOrSlug}" not found`);
    }

    return tag;
  }

  async updateTag(id: string, data: { name?: string; slug?: string }) {
    const existing = await prisma.tag.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundError(`Tag with ID "${id}" not found`);
    }

    if (data.name && data.name !== existing.name) {
      const duplicateName = await prisma.tag.findUnique({ where: { name: data.name } });
      if (duplicateName) {
        throw new ConflictError(`Tag with name "${data.name}" already exists`);
      }
    }

    let slug = existing.slug;
    if (data.slug && data.slug !== existing.slug) {
      const duplicateSlug = await prisma.tag.findUnique({ where: { slug: data.slug } });
      if (duplicateSlug) {
        throw new ConflictError(`Tag with slug "${data.slug}" already exists`);
      }
      slug = createSlug(data.slug);
    } else if (data.name && data.name !== existing.name && !data.slug) {
      slug = await generateUniqueSlug(
        data.name,
        async (s) => !!(await prisma.tag.findFirst({ where: { slug: s, NOT: { id } } })),
      );
    }

    return prisma.tag.update({
      where: { id },
      data: {
        name: data.name,
        slug,
      },
      include: {
        _count: {
          select: { posts: true },
        },
      },
    });
  }

  async deleteTag(id: string) {
    const existing = await prisma.tag.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundError(`Tag with ID "${id}" not found`);
    }

    await prisma.tag.delete({ where: { id } });
    return { success: true, message: `Tag "${existing.name}" deleted successfully` };
  }
}

export const tagsService = new TagsService();
