import { prisma } from '../../database/prisma';
import { ConflictError, ForbiddenError, NotFoundError } from '../../common/errors/app-error';
import { createSlug, generateUniqueSlug } from '../../common/utils/slug';
import { buildPaginationMeta, parsePagination } from '../../common/utils/pagination';
import { AuthUser, PaginatedResponse } from '../../common/types';

export interface CreatePostDto {
  title: string;
  slug?: string;
  content: string;
  excerpt?: string;
  published?: boolean;
  featured?: boolean;
  categories?: string[];
  tags?: string[];
  metaTitle?: string;
  metaDescription?: string;
  canonicalUrl?: string;
  featuredImage?: string;
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
}

export interface UpdatePostDto {
  title?: string;
  slug?: string;
  content?: string;
  excerpt?: string;
  published?: boolean;
  featured?: boolean;
  categories?: string[];
  tags?: string[];
  metaTitle?: string;
  metaDescription?: string;
  canonicalUrl?: string;
  featuredImage?: string;
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
}

export interface ListPostsQuery {
  page?: number;
  limit?: number;
  search?: string;
  category?: string;
  tag?: string;
  authorId?: string;
  featured?: boolean;
  published?: boolean;
  sortBy?: 'createdAt' | 'views' | 'title';
  sortOrder?: 'asc' | 'desc';
}

export class PostsService {
  private async resolveCategoryConnect(categories?: string[]) {
    if (!categories || categories.length === 0) return undefined;
    const resolved = await prisma.category.findMany({
      where: {
        OR: [{ id: { in: categories } }, { slug: { in: categories } }, { name: { in: categories } }],
      },
      select: { id: true },
    });
    return { connect: resolved.map((c) => ({ id: c.id })) };
  }

  private async resolveTagConnect(tags?: string[]) {
    if (!tags || tags.length === 0) return undefined;
    const resolved = await prisma.tag.findMany({
      where: {
        OR: [{ id: { in: tags } }, { slug: { in: tags } }, { name: { in: tags } }],
      },
      select: { id: true },
    });
    return { connect: resolved.map((t) => ({ id: t.id })) };
  }

  async createPost(data: CreatePostDto, authorId: string) {
    const slug = await generateUniqueSlug(
      data.title,
      async (s) => !!(await prisma.post.findUnique({ where: { slug: s } })),
      data.slug,
    );

    const categoriesConnect = await this.resolveCategoryConnect(data.categories);
    const tagsConnect = await this.resolveTagConnect(data.tags);

    return prisma.post.create({
      data: {
        title: data.title,
        slug,
        content: data.content,
        excerpt: data.excerpt,
        published: data.published ?? false,
        featured: data.featured ?? false,
        authorId,
        metaTitle: data.metaTitle,
        metaDescription: data.metaDescription,
        canonicalUrl: data.canonicalUrl,
        featuredImage: data.featuredImage,
        ogTitle: data.ogTitle,
        ogDescription: data.ogDescription,
        ogImage: data.ogImage,
        categories: categoriesConnect,
        tags: tagsConnect,
      },
      include: {
        categories: { select: { id: true, name: true, slug: true } },
        tags: { select: { id: true, name: true, slug: true } },
      },
    });
  }

  async listPosts(query: ListPostsQuery, currentUser?: AuthUser): Promise<PaginatedResponse<any>> {
    const { page, limit, skip, take } = parsePagination(query.page, query.limit);

    const where: any = {};

    // Published filter logic
    if (query.published !== undefined) {
      if (!query.published) {
        // Only author or admin can see unpublished posts
        if (!currentUser) {
          throw new ForbiddenError('Authentication required to view draft posts');
        }
        if (currentUser.role !== 'ADMIN') {
          where.authorId = currentUser.id;
        }
        where.published = false;
      } else {
        where.published = true;
      }
    } else {
      // Default: only published posts for general listing
      where.published = true;
    }

    if (query.featured !== undefined) {
      where.featured = query.featured;
    }

    if (query.authorId) {
      where.authorId = query.authorId;
    }

    if (query.category) {
      where.categories = {
        some: {
          OR: [{ id: query.category }, { slug: query.category }, { name: query.category }],
        },
      };
    }

    if (query.tag) {
      where.tags = {
        some: {
          OR: [{ id: query.tag }, { slug: query.tag }, { name: query.tag }],
        },
      };
    }

    if (query.search) {
      where.OR = [
        { title: { contains: query.search, mode: 'insensitive' } },
        { content: { contains: query.search, mode: 'insensitive' } },
        { excerpt: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const sortBy = query.sortBy || 'createdAt';
    const sortOrder = query.sortOrder || 'desc';

    const [total, data] = await Promise.all([
      prisma.post.count({ where }),
      prisma.post.findMany({
        where,
        skip,
        take,
        orderBy: { [sortBy]: sortOrder },
        include: {
          categories: { select: { id: true, name: true, slug: true } },
          tags: { select: { id: true, name: true, slug: true } },
        },
      }),
    ]);

    return {
      data,
      pagination: buildPaginationMeta(total, page, limit),
    };
  }

  async getDrafts(query: { page?: number; limit?: number }, currentUser: AuthUser): Promise<PaginatedResponse<any>> {
    const { page, limit, skip, take } = parsePagination(query.page, query.limit);

    const where: any = { published: false };
    if (currentUser.role !== 'ADMIN') {
      where.authorId = currentUser.id;
    }

    const [total, data] = await Promise.all([
      prisma.post.count({ where }),
      prisma.post.findMany({
        where,
        skip,
        take,
        orderBy: { updatedAt: 'desc' },
        include: {
          categories: { select: { id: true, name: true, slug: true } },
          tags: { select: { id: true, name: true, slug: true } },
        },
      }),
    ]);

    return {
      data,
      pagination: buildPaginationMeta(total, page, limit),
    };
  }

  async getPostById(id: string, currentUser?: AuthUser) {
    const post = await prisma.post.findUnique({
      where: { id },
      include: {
        categories: { select: { id: true, name: true, slug: true } },
        tags: { select: { id: true, name: true, slug: true } },
      },
    });

    if (!post) {
      throw new NotFoundError(`Post with ID "${id}" not found`);
    }

    if (!post.published) {
      const isAuthor = currentUser && currentUser.id === post.authorId;
      const isAdmin = currentUser && currentUser.role === 'ADMIN';
      if (!isAuthor && !isAdmin) {
        throw new ForbiddenError('Post is not published');
      }
    }

    return post;
  }

  async getPostBySlug(slug: string, currentUser?: AuthUser) {
    const post = await prisma.post.findUnique({
      where: { slug },
      include: {
        categories: { select: { id: true, name: true, slug: true } },
        tags: { select: { id: true, name: true, slug: true } },
      },
    });

    if (!post) {
      throw new NotFoundError(`Post with slug "${slug}" not found`);
    }

    if (!post.published) {
      const isAuthor = currentUser && currentUser.id === post.authorId;
      const isAdmin = currentUser && currentUser.role === 'ADMIN';
      if (!isAuthor && !isAdmin) {
        throw new ForbiddenError('Post is not published');
      }
    }

    // Increment view count
    const updatedPost = await prisma.post.update({
      where: { id: post.id },
      data: { views: { increment: 1 } },
      include: {
        categories: { select: { id: true, name: true, slug: true } },
        tags: { select: { id: true, name: true, slug: true } },
      },
    });

    return updatedPost;
  }

  async updatePost(id: string, data: UpdatePostDto, currentUser: AuthUser) {
    const existing = await prisma.post.findUnique({
      where: { id },
      include: { categories: true, tags: true },
    });

    if (!existing) {
      throw new NotFoundError(`Post with ID "${id}" not found`);
    }

    const isAuthor = currentUser.id === existing.authorId;
    const isAdmin = currentUser.role === 'ADMIN';
    if (!isAuthor && !isAdmin) {
      throw new ForbiddenError('You are not authorized to update this post');
    }

    let slug = existing.slug;
    if (data.slug && data.slug !== existing.slug) {
      const duplicateSlug = await prisma.post.findUnique({ where: { slug: data.slug } });
      if (duplicateSlug) {
        throw new ConflictError(`Post with slug "${data.slug}" already exists`);
      }
      slug = createSlug(data.slug);
    } else if (data.title && data.title !== existing.title && !data.slug) {
      slug = await generateUniqueSlug(
        data.title,
        async (s) => !!(await prisma.post.findFirst({ where: { slug: s, NOT: { id } } })),
      );
    }

    let categoriesUpdate: any = undefined;
    if (data.categories !== undefined) {
      const resolved = await prisma.category.findMany({
        where: {
          OR: [{ id: { in: data.categories } }, { slug: { in: data.categories } }, { name: { in: data.categories } }],
        },
        select: { id: true },
      });
      categoriesUpdate = {
        set: resolved.map((c) => ({ id: c.id })),
      };
    }

    let tagsUpdate: any = undefined;
    if (data.tags !== undefined) {
      const resolved = await prisma.tag.findMany({
        where: {
          OR: [{ id: { in: data.tags } }, { slug: { in: data.tags } }, { name: { in: data.tags } }],
        },
        select: { id: true },
      });
      tagsUpdate = {
        set: resolved.map((t) => ({ id: t.id })),
      };
    }

    return prisma.post.update({
      where: { id },
      data: {
        title: data.title,
        slug,
        content: data.content,
        excerpt: data.excerpt,
        published: data.published,
        featured: data.featured,
        categories: categoriesUpdate,
        tags: tagsUpdate,
        metaTitle: data.metaTitle,
        metaDescription: data.metaDescription,
        canonicalUrl: data.canonicalUrl,
        featuredImage: data.featuredImage,
        ogTitle: data.ogTitle,
        ogDescription: data.ogDescription,
        ogImage: data.ogImage,
      },
      include: {
        categories: { select: { id: true, name: true, slug: true } },
        tags: { select: { id: true, name: true, slug: true } },
      },
    });
  }

  async setPublishStatus(id: string, published: boolean, currentUser: AuthUser) {
    const existing = await prisma.post.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundError(`Post with ID "${id}" not found`);
    }

    const isAuthor = currentUser.id === existing.authorId;
    const isAdmin = currentUser.role === 'ADMIN';
    if (!isAuthor && !isAdmin) {
      throw new ForbiddenError('You are not authorized to publish/unpublish this post');
    }

    return prisma.post.update({
      where: { id },
      data: { published },
      include: {
        categories: { select: { id: true, name: true, slug: true } },
        tags: { select: { id: true, name: true, slug: true } },
      },
    });
  }

  async deletePost(id: string, currentUser: AuthUser) {
    const existing = await prisma.post.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundError(`Post with ID "${id}" not found`);
    }

    const isAuthor = currentUser.id === existing.authorId;
    const isAdmin = currentUser.role === 'ADMIN';
    if (!isAuthor && !isAdmin) {
      throw new ForbiddenError('You are not authorized to delete this post');
    }

    await prisma.post.delete({ where: { id } });
    return { success: true, message: `Post "${existing.title}" deleted successfully` };
  }
}

export const postsService = new PostsService();
