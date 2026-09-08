import { prisma } from '../../database/prisma';
import { ConflictError, NotFoundError } from '../../common/errors/app-error';
import { createSlug, generateUniqueSlug } from '../../common/utils/slug';

export class CategoriesService {
  async createCategory(data: { name: string; slug?: string; description?: string }) {
    const existingByName = await prisma.category.findUnique({
      where: { name: data.name },
    });
    if (existingByName) {
      throw new ConflictError(`Category with name "${data.name}" already exists`);
    }

    const slug = await generateUniqueSlug(
      data.name,
      async (s) => !!(await prisma.category.findUnique({ where: { slug: s } })),
      data.slug,
    );

    return prisma.category.create({
      data: {
        name: data.name,
        slug,
        description: data.description,
      },
      include: {
        _count: {
          select: { posts: true },
        },
      },
    });
  }

  async listCategories(search?: string) {
    const where: any = {};
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    return prisma.category.findMany({
      where,
      orderBy: { name: 'asc' },
      include: {
        _count: {
          select: { posts: true },
        },
      },
    });
  }

  async getCategoryByIdOrSlug(idOrSlug: string) {
    const category = await prisma.category.findFirst({
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

    if (!category) {
      throw new NotFoundError(`Category "${idOrSlug}" not found`);
    }

    return category;
  }

  async updateCategory(id: string, data: { name?: string; slug?: string; description?: string }) {
    const existing = await prisma.category.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundError(`Category with ID "${id}" not found`);
    }

    if (data.name && data.name !== existing.name) {
      const duplicateName = await prisma.category.findUnique({ where: { name: data.name } });
      if (duplicateName) {
        throw new ConflictError(`Category with name "${data.name}" already exists`);
      }
    }

    let slug = existing.slug;
    if (data.slug && data.slug !== existing.slug) {
      const duplicateSlug = await prisma.category.findUnique({ where: { slug: data.slug } });
      if (duplicateSlug) {
        throw new ConflictError(`Category with slug "${data.slug}" already exists`);
      }
      slug = createSlug(data.slug);
    } else if (data.name && data.name !== existing.name && !data.slug) {
      slug = await generateUniqueSlug(
        data.name,
        async (s) => !!(await prisma.category.findFirst({ where: { slug: s, NOT: { id } } })),
      );
    }

    return prisma.category.update({
      where: { id },
      data: {
        name: data.name,
        slug,
        description: data.description,
      },
      include: {
        _count: {
          select: { posts: true },
        },
      },
    });
  }

  async deleteCategory(id: string) {
    const existing = await prisma.category.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundError(`Category with ID "${id}" not found`);
    }

    await prisma.category.delete({ where: { id } });
    return { success: true, message: `Category "${existing.name}" deleted successfully` };
  }
}

export const categoriesService = new CategoriesService();
