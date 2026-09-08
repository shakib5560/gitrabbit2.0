# GitRabbit Blog Service

High-performance Blog and Content Management microservice built with Fastify v4, TypeScript, Prisma ORM, and PostgreSQL.

---

## Features

- **Post Management**: Full CRUD operations for published and draft posts with rich content and excerpt support.
- **Automated Slug Generation**: Dynamic, unique URL slug generation using `slugify` with collision resolution (e.g., `my-post-1`).
- **View Count Analytics**: Automatic view count incrementation on post reads.
- **Search, Filtering & Pagination**: Paginated post retrieval with keyword search across title/content/excerpt and filtering by category or tag.
- **SEO & Social Sharing Metadata**: First-class support for SEO tags: meta title, meta description, canonical URL, featured image, and OpenGraph metadata (`ogTitle`, `ogDescription`, `ogImage`).
- **Category & Tag Taxonomy**: Full CRUD management with automatic post count aggregation (`_count.posts`) and unique slug lookups.
- **Cross-Service Authentication**: Decodes and validates JWT access tokens issued by the Auth Service using the shared secret (`JWT_ACCESS_SECRET` / `JWT_SECRET`).
- **Granular RBAC & Ownership**: Role-based access control allowing authors to update/delete their own posts and `ADMIN` users to manage all content, categories, and tags.
- **Interactive OpenAPI Documentation**: Built-in Swagger UI powered by `@fastify/swagger` and `@fastify/swagger-ui` available at `/docs`.
- **Database Seeding**: Ready-to-use seed script (`npm run seed`) populating categories, tags, and demo posts.
- **Automated Testing Suite**: Full suite of unit, integration, and E2E tests using Jest and Supertest/inject.

---

## Tech Stack

- **Framework**: Fastify v4
- **Language**: TypeScript v5
- **ORM**: Prisma v5
- **Database**: PostgreSQL 15 (`blog_db`, port `5435` local / `5432` container)
- **Authentication**: `@fastify/jwt`
- **Documentation**: `@fastify/swagger` + `@fastify/swagger-ui`
- **Testing**: Jest v30 + `ts-jest`

---

## Prerequisites

- [Node.js](https://nodejs.org/) v20+
- [PostgreSQL](https://www.postgresql.org/) v15+ (or run via Docker Compose)
- `npm` v10+

---

## Configuration

Configuration is loaded from environment variables (or `.env` in the root or service directory):

| Variable | Description | Default / Example |
|---|---|---|
| `PORT` | HTTP server port | `4000` |
| `HOST` | HTTP server host binding | `0.0.0.0` |
| `NODE_ENV` | Environment mode (`development`, `production`, `test`) | `development` |
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://postgres:postgres@localhost:5435/blog_db` |
| `JWT_ACCESS_SECRET` / `JWT_SECRET` | Shared secret key for JWT validation | `super_secret_jwt_key` |

---

## Installation & Running

```bash
# Install dependencies
npm install

# Run database migrations
npx prisma migrate dev

# Seed database with demo categories, tags, and posts
npm run seed

# Start development server with live reload
npm run dev

# Build TypeScript to JavaScript
npm run build

# Start production server
npm start
```

---

## Architecture & Project Structure

The service follows a modular, feature-based architecture separating routing, validation schemas, business logic, and database access:

```text
services/blog-service/
├── prisma/
│   ├── migrations/          # Version-controlled database migrations
│   ├── schema.prisma        # Prisma data models (Post, Category, Tag, Comment)
│   └── seed.ts              # Database seeder for demo data
├── src/
│   ├── app.ts               # Fastify application factory (plugins, swagger, error handlers)
│   ├── server.ts            # Application bootstrap and graceful shutdown
│   ├── config/
│   │   └── env.ts           # Centralized environment variable validation
│   ├── database/
│   │   └── prisma.ts        # Prisma client singleton
│   ├── common/
│   │   ├── errors/          # Custom AppError classes and error handling
│   │   ├── types/           # Shared TypeScript types and JWT definitions
│   │   └── utils/           # Helper utilities (slug generator, pagination)
│   ├── auth/
│   │   ├── jwt.guard.ts     # JWT authentication preHandler hook
│   │   └── roles.guard.ts   # Role-based access control guard
│   └── modules/
│       ├── posts/           # Post controller, service, routes, schemas
│       ├── categories/      # Category controller, service, routes, schemas
│       └── tags/            # Tag controller, service, routes, schemas
└── test/                    # Jest test suites and E2E test runner
```

---

## API Endpoints

Interactive Swagger API Documentation is accessible at **`http://localhost:4000/docs`** (or via gateway at `http://localhost/api/blog/docs`).

### Posts (`/posts`)

| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| `GET` | `/posts` | List posts with pagination (`page`, `limit`), search, and filters (`category`, `tag`, `published`, `featured`) | No |
| `GET` | `/posts/feed` | List published posts ordered chronologically | No |
| `GET` | `/posts/slug/:slug` | Retrieve single published post by unique slug (increments views) | No |
| `GET` | `/posts/:id` | Retrieve single post by ID (increments views if published) | No |
| `POST` | `/posts` | Create new post (generates unique slug and attaches categories/tags) | Yes (Bearer JWT) |
| `PUT` | `/posts/:id` | Update post details, categories, tags, and SEO fields | Author or ADMIN |
| `DELETE` | `/posts/:id` | Permanently delete post | Author or ADMIN |

### Categories (`/categories`)

| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| `GET` | `/categories` | List all categories with post count aggregation | No |
| `GET` | `/categories/:idOrSlug` | Retrieve category details and its posts | No |
| `POST` | `/categories` | Create new category (generates unique slug) | ADMIN |
| `PUT` | `/categories/:id` | Update category name and description | ADMIN |
| `DELETE` | `/categories/:id` | Delete category | ADMIN |

### Tags (`/tags`)

| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| `GET` | `/tags` | List all tags with post count aggregation | No |
| `GET` | `/tags/:idOrSlug` | Retrieve tag details and its posts | No |
| `POST` | `/tags` | Create new tag (generates unique slug) | ADMIN |
| `PUT` | `/tags/:id` | Update tag name | ADMIN |
| `DELETE` | `/tags/:id` | Delete tag | ADMIN |

### System & Documentation

| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| `GET` | `/health` | Service health check and database connection ping | No |
| `GET` | `/docs` | Interactive Swagger / OpenAPI documentation UI | No |
| `GET` | `/docs/json` | OpenAPI 3.0 specification JSON | No |

---

## Testing

```bash
# Run all automated tests with Jest
npm run test

# Run end-to-end integration test runner
npm run test:e2e
```
