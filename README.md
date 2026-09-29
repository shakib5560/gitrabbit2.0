# GitRabbit Backend v2

A microservices-based backend built for scalability, isolation, and independent deployability. Each service owns its own domain, database, and runtime environment.

---

> [!NOTE]
> **AI Service**
>
> The `ai-service` source code is maintained in a private repository and is intentionally not included here.

## Architecture Overview

```mermaid
graph TD
    Client(["🖥️ Client"])
    GW["API Gateway (Nginx)\nPort 80"]

    subgraph Auth ["Auth + Realtime Service (NestJS · Port 3000)"]
        AuthSvc["Auth & User Management\nWebSocket / Socket.IO"]
        AuthDB[("auth_db\nPostgreSQL")]
    end

    subgraph AI ["AI / LLM Service (FastAPI · Port 8000)"]
        AISvc["LLM Request Processing\nOpenAI / Anthropic"]
        AIDB[("ai_db\nPostgreSQL")]
    end

    subgraph Blog ["Blog Service (Fastify · Port 4000)"]
        BlogSvc["Posts, Categories, Tags, Comments"]
        BlogDB[("blog_db\nPostgreSQL")]
    end

    Client --> GW
    GW -- "/api/auth/*" --> AuthSvc
    GW -- "/socket.io/*" --> AuthSvc
    GW -- "/api/ai/*" --> AISvc
    GW -- "/api/blog/*" --> BlogSvc

    AuthSvc --> AuthDB
    AISvc --> AIDB
    BlogSvc --> BlogDB
```

> **Key principle**: Each service exclusively owns its own database. No service ever directly queries another service's database.

---

## Services

### Auth + Realtime Service — NestJS

**Port:** `3000` | **Framework:** NestJS v11 | **ORM:** Prisma v5 | **Database:** `auth_db`

Responsible for authentication, user management, and real-time communication. Auth and WebSocket functionality are co-located in a single service because WebSocket connections share the same authentication context — JWT tokens issued by the auth system protect WebSocket connections directly.

**What is implemented:**

| Feature | Status |
|---|---|
| NestJS application bootstrap | ✅ |
| Prisma integration with `auth_db` | ✅ |
| `User` model (id, name, email, password, role, timestamps) | ✅ |
| `RefreshToken` model with cascade delete | ✅ |
| Role-based enum (`USER`, `ADMIN`) | ✅ |
| `bcrypt` password hashing dependency | ✅ |
| WebSocket Gateway (Socket.IO) | ✅ |
| WebSocket connection/disconnection handling | ✅ |
| `ping` → `pong` WebSocket event | ✅ |
| Prisma auto-migration on container start | ✅ |
| JWT authentication endpoints | ✅ |
| Refresh token rotation | ✅ |
| Guards / RBAC enforcement | ✅ |
| GitHub OAuth 2.0 integration | ✅ |
| Interactive OpenAPI / Swagger UI (`/docs`) | ✅ |
| End-to-End test suite (Jest) | ✅ |
| WebSocket authentication guards | 🚧 In progress |


**Database Schema:**
```prisma
User       → id, name, email, password, role (USER|ADMIN), createdAt, updatedAt
RefreshToken → id, token, userId, expiresAt, createdAt
```

---

### AI / LLM Service — FastAPI

**Port:** `8000` | **Framework:** FastAPI | **ORM:** SQLAlchemy (async) + Alembic | **Database:** `ai_db`

Handles all AI and LLM-related functionality. The service receives the authenticated user's identity from upstream (API Gateway or Auth Service) via request context — it **never** directly queries `auth_db`.

**What is implemented:**

| Feature | Status |
|---|---|
| FastAPI application bootstrap | ✅ |
| SQLAlchemy async engine with `asyncpg` | ✅ |
| Alembic migrations auto-applied on startup | ✅ |
| `Conversation` model (id, user_id, model_name, timestamps) | ✅ |
| `Message` model (id, conversation_id, role, content, token_usage) | ✅ |
| `/health` endpoint with database ping | ✅ |
| `/api/status` endpoint | ✅ |
| OpenAI SDK dependency | ✅ |
| Anthropic SDK dependency | ✅ |
| LLM request/response handling | 🚧 In progress |
| Conversation history API | 🚧 In progress |
| Token usage tracking | 🚧 In progress |

**Database Schema:**
```
Conversation → id, user_id (reference only), model_name, created_at, updated_at
Message      → id, conversation_id, role, content, token_usage, created_at
```

---

### Blog Service — Fastify

**Port:** `4000` | **Framework:** Fastify v4 | **ORM:** Prisma v5 | **Database:** `blog_db`

Manages all blog content. The service stores only the authenticated user's ID (`authorId`) as a reference — it does **not** mirror or directly access the Auth Service's user table.

JWT tokens issued by the Auth Service are verified locally by the Blog Service using the shared `JWT_SECRET`.

**What is implemented:**

| Feature | Status |
|---|---|
| Fastify application bootstrap & clean modular architecture | ✅ |
| Prisma integration with `blog_db` | ✅ |
| `Post` model (SEO fields, views count, featured flag, authorId) | ✅ |
| `Category` model with unique slugs & post counts | ✅ |
| `Tag` model with unique slugs & post counts | ✅ |
| `Comment` model (id, postId, authorId, content) | ✅ |
| `@fastify/jwt` registered for token verification | ✅ |
| `jwtGuard` and RBAC authorization guards (`ADMIN`, author ownership) | ✅ |
| `/health` endpoint with database ping | ✅ |
| Prisma auto-migration on container start | ✅ |
| Database seeder script (`npm run seed`) | ✅ |
| CRUD endpoints for Posts (pagination, search, filters) | ✅ |
| Automated unique slug generation (`slugify`) | ✅ |
| View counter analytics (auto-increment on read) | ✅ |
| Category / Tag management endpoints | ✅ |
| Interactive OpenAPI / Swagger UI (`/docs`) | ✅ |
| Unit & integration test suites (Jest) | ✅ |
| Standalone E2E verification test runner | ✅ |
| CRUD endpoints for Comments | 🚧 In progress |

**Database Schema:**
```prisma
Post     → id, authorId, title, slug, content, excerpt, published, featured, views,
            metaTitle, metaDescription, canonicalUrl, featuredImage, ogTitle, ogDescription, ogImage,
            createdAt, updatedAt
Category → id, name, slug, description, createdAt, updatedAt ↔ Post (M2M)
Tag      → id, name, slug, createdAt, updatedAt ↔ Post (M2M)
Comment  → id, postId, authorId, content, createdAt, updatedAt
```

---

## Database Architecture

Each service has a completely independent PostgreSQL instance. No cross-database queries are permitted.

```mermaid
graph LR
    A["Auth Service"] --> AD[("auth_db\nPort 5433")]
    B["AI Service"]   --> BD[("ai_db\nPort 5434")]
    C["Blog Service"] --> CD[("blog_db\nPort 5435")]

    style AD fill:#2d6a4f,color:#fff
    style BD fill:#1d3557,color:#fff
    style CD fill:#6d2d6a,color:#fff
```

| Service | Database | ORM | Port (local) | Volume |
|---|---|---|---|---|
| Auth | `auth_db` | Prisma v5 | `5433` | `auth-db-data` |
| AI | `ai_db` | SQLAlchemy + Alembic | `5434` | `ai-db-data` |
| Blog | `blog_db` | Prisma v5 | `5435` | `blog-db-data` |

**Migration strategy:**
- Auth & Blog: `prisma migrate deploy` runs automatically in the container `CMD`
- AI: `alembic upgrade head` runs automatically in the container `CMD`
- All databases are reproducible from an empty Docker volume

---

## API Gateway

The gateway is an **Nginx** reverse proxy that routes all incoming traffic to the appropriate downstream service.

```
GET  /api/auth/*    → auth-service:3000
WS   /socket.io/*   → auth-service:3000  (WebSocket upgrade)
GET  /api/ai/*      → ai-service:8000
GET  /api/blog/*    → blog-service:4000
```

The Nginx configuration handles WebSocket upgrades (`Upgrade` / `Connection` headers) for the Socket.IO endpoint.

---

## Docker Architecture

```mermaid
graph TD
    subgraph compose ["docker-compose.yml"]
        GW["api-gateway\n(Nginx · :80)"]
        AUTH["auth-service\n(NestJS · :3000)"]
        AI["ai-service\n(FastAPI · :8000)"]
        BLOG["blog-service\n(Fastify · :4000)"]
        ADB["auth-db\n(Postgres · :5433)"]
        AIDB["ai-db\n(Postgres · :5434)"]
        BDB["blog-postgres\n(Postgres · :5435)"]
        REDIS["redis\n(:6379)"]
    end

    GW --> AUTH
    GW --> AI
    GW --> BLOG
    AUTH -- "service_healthy" --> ADB
    AI   -- "service_healthy" --> AIDB
    BLOG -- "service_healthy" --> BDB
```

**Health checks** are configured on all three PostgreSQL containers using `pg_isready`. Service containers use `condition: service_healthy` to delay startup until their respective databases are ready.

**Internal networking:** All containers are on the `microservices-network` bridge. Services communicate using container names as hostnames (e.g., `http://auth-service:3000`).

**Persistent volumes:**

| Volume | Service |
|---|---|
| `auth-db-data` | auth-db |
| `ai-db-data` | ai-db |
| `blog-db-data` | blog-postgres |
| `redis-data` | redis |

**Common Docker commands:**

```bash
# Build and start all services
docker compose up --build

# Start in the background
docker compose up -d --build

# Stop all services
docker compose down

# Stop and remove volumes (⚠️ destroys database data)
docker compose down -v

# Stream logs for all services
docker compose logs -f

# Stream logs for a specific service
docker compose logs -f auth-service
docker compose logs -f ai-service
docker compose logs -f blog-service
```

---

## Repository Structure

```text
backend-v2/
├── gateway/
│   ├── Dockerfile           # Nginx image build
│   └── nginx.conf           # Reverse proxy routing rules
│
├── services/
│   ├── auth/                # Auth + Realtime service (NestJS)
│   │   ├── prisma/
│   │   │   ├── migrations/  # Database migrations
│   │   │   └── schema.prisma# Auth models (User, RefreshToken)
│   │   ├── src/
│   │   │   ├── auth/        # Auth controller, service, strategies, guards, DTOs
│   │   │   ├── prisma/      # PrismaService / PrismaModule
│   │   │   ├── websocket/   # WebSocket gateway, service, module
│   │   │   ├── app.module.ts
│   │   │   └── main.ts      # Bootstrap & Swagger UI setup
│   │   ├── test/            # Unit & E2E integration test suites
│   │   ├── Dockerfile
│   │   ├── README.md
│   │   └── package.json
│   │
│   ├── ai-service/          # AI / LLM service (FastAPI)
│   │   ├── app/
│   │   │   ├── api/         # FastAPI routers
│   │   │   ├── core/        # Configuration, settings
│   │   │   ├── db/          # database.py, models.py
│   │   │   ├── models/      # Pydantic / domain models
│   │   │   ├── services/    # Business logic
│   │   │   └── main.py
│   │   ├── migrations/      # Alembic migration versions
│   │   ├── alembic.ini
│   │   ├── Dockerfile
│   │   └── requirements.txt
│   │
│   └── blog-service/        # Blog service (Fastify + TypeScript)
│       ├── prisma/
│       │   ├── migrations/  # Database migrations
│       │   ├── schema.prisma# Post (SEO/views), Category, Tag, Comment models
│       │   └── seed.ts      # Database seed script for demo data
│       ├── src/
│       │   ├── app.ts       # Fastify factory with Swagger & error handling
│       │   ├── server.ts    # Application entry point & graceful shutdown
│       │   ├── auth/        # JWT verification & RBAC guards
│       │   ├── common/      # AppError, shared types, slugify, pagination
│       │   ├── config/      # Environment variable validation
│       │   ├── database/    # Prisma client singleton
│       │   └── modules/     # Posts, Categories, Tags (routes, controllers, services, schemas)
│       ├── test/            # Jest unit/integration tests & E2E runner
│       ├── Dockerfile
│       ├── README.md
│       └── package.json
│
├── docker-compose.yml       # Full stack orchestration
├── .env.example             # Environment variable template
├── .gitignore
└── README.md
```

---

## Service Communication

**Current implementation:** All inter-service communication happens through **HTTP REST APIs** via internal Docker networking. The API Gateway handles external routing.

```
Client
  │
  ▼
API Gateway (Nginx :80)
  │
  ├── /api/auth/*   → Auth Service (:3000)    [REST]
  ├── /socket.io/*  → Auth Service (:3000)    [WebSocket / Socket.IO]
  ├── /api/ai/*     → AI Service (:8000)      [REST]
  └── /api/blog/*   → Blog Service (:4000)    [REST]
```

**Authentication flow:**

```
Client
  │  (sends credentials)
  ▼
Auth Service  ──→  Issues JWT (access token) + Refresh Token
  │
  ▼
Client stores JWT
  │  (sends JWT in Authorization header)
  ▼
Blog Service / AI Service
  │  (verifies JWT signature locally using shared JWT_SECRET)
  ▼
Extracts user ID → uses as authorId / user_id reference
```

> ⚠️ The Blog and AI services **never** call the Auth database. They only verify the JWT signature and extract the user identity from the token payload.

**Planned (not yet implemented):**
- Redis pub/sub for event-driven communication between services
- Async message broker for background AI job processing

---

## Security

| Mechanism | Status | Notes |
|---|---|---|
| `bcrypt` password hashing | ✅ | Active in Auth Service |
| JWT access tokens | ✅ | Signed by Auth Service, verified cross-service |
| JWT refresh tokens | ✅ | Secure HTTP-only cookies, rotation & revocation |
| Role enum (`USER`, `ADMIN`) | ✅ | Defined in Prisma schemas |
| RBAC enforcement | ✅ | Guards in NestJS (Auth) and Fastify (Blog) |
| Database isolation per service | ✅ | Each service has its own DB |
| CORS | ✅ | Handled at API Gateway and service levels |
| Secrets via environment variables | ✅ | Injected via `.env` / Docker Compose |
| Interactive Swagger Documentation | ✅ | OpenAPI 3.0 at `/docs` on Auth (:3000) and Blog (:4000) |
| Input validation | ✅ | class-validator (Auth), Fastify schemas (Blog), Pydantic (AI) |
| WebSocket authentication | 🚧 | Connection handler stub in place |
| Rate limiting | ⏳ | Not yet implemented |

> **Important:** Never commit `.env` files or real credentials to version control. Use `.env.example` as the template and create a `.env` locally.

---

## Available Endpoints

### Auth Service (`/api/auth` or `http://localhost:3000`)

| Method | Path | Purpose | Auth |
|---|---|---|---|
| `GET` | `/` | Service health status | No |
| `POST` | `/auth/register` | Register new user account | No |
| `POST` | `/auth/login` | Authenticate with email/password; returns JWT + sets Refresh cookie | No |
| `POST` | `/auth/refresh` | Rotate refresh token and issue new access token | Refresh Cookie |
| `POST` | `/auth/logout` | Invalidate refresh token and clear cookie | Bearer JWT |
| `GET` | `/auth/github` | Initiate GitHub OAuth 2.0 flow | No |
| `GET` | `/auth/github/callback` | Handle GitHub OAuth callback and token issuance | No |
| `GET` | `/auth/me` | Retrieve authenticated user profile claims | Bearer JWT |
| `GET` | `/docs` | Interactive Swagger / OpenAPI documentation UI | No |
| `GET` | `/docs-json` | OpenAPI 3.0 specification JSON | No |

### Blog Service (`/api/blog` or `http://localhost:4000`)

| Method | Path | Purpose | Auth |
|---|---|---|---|
| `GET` | `/posts` | List posts with pagination (`page`, `limit`), search, and filters (`category`, `tag`, `published`, `featured`) | No |
| `GET` | `/posts/feed` | List published posts ordered chronologically | No |
| `GET` | `/posts/slug/:slug` | Retrieve single published post by slug (increments view counter) | No |
| `GET` | `/posts/:id` | Retrieve single post by ID (increments views if published) | No |
| `POST` | `/posts` | Create new post (generates unique slug, attaches categories/tags, optional SEO fields) | Bearer JWT |
| `PUT` | `/posts/:id` | Update post details, categories, tags, or SEO metadata | Author or ADMIN |
| `DELETE` | `/posts/:id` | Permanently delete post | Author or ADMIN |
| `GET` | `/categories` | List all categories with post count aggregation | No |
| `GET` | `/categories/:idOrSlug` | Retrieve category details and its posts | No |
| `POST` | `/categories` | Create new category (generates unique slug) | ADMIN |
| `PUT` | `/categories/:id` | Update category name and description | ADMIN |
| `DELETE` | `/categories/:id` | Delete category | ADMIN |
| `GET` | `/tags` | List all tags with post count aggregation | No |
| `GET` | `/tags/:idOrSlug` | Retrieve tag details and its posts | No |
| `POST` | `/tags` | Create new tag (generates unique slug) | ADMIN |
| `PUT` | `/tags/:id` | Update tag name | ADMIN |
| `DELETE` | `/tags/:id` | Delete tag | ADMIN |
| `GET` | `/health` | Health check + database connectivity ping | No |
| `GET` | `/docs` | Interactive Swagger / OpenAPI documentation UI | No |
| `GET` | `/docs/json` | OpenAPI 3.0 specification JSON | No |

### AI Service (`/api/ai` or `http://localhost:8000`)

| Method | Path | Purpose | Auth |
|---|---|---|---|
| `GET` | `/health` | Health check + DB ping | No |
| `GET` | `/api/status` | Service status | No |

> 🚧 LLM completion, conversation history, and message endpoints are in progress.

### WebSocket (`/socket.io`)

| Event | Direction | Purpose |
|---|---|---|
| `connection` | Server | Logs new client connection |
| `disconnect` | Server | Logs client disconnection |
| `ping` | Client → Server | Returns `pong` |

> 🚧 Authenticated events and broadcast functionality are in progress.

---

## Development Setup

### Requirements

- [Docker](https://docs.docker.com/get-docker/) and Docker Compose
- [Node.js](https://nodejs.org/) v20+ (for running services individually)
- [Python](https://www.python.org/) 3.11+ (for AI service individually)
- `npm` or a compatible package manager

### Installation

```bash
git clone <repository-url>
cd backend-v2
```

### Environment Variables

```bash
cp .env.example .env
# Edit .env and fill in your actual secrets (JWT keys, API keys, etc.)
```

> Never commit your `.env` file. It is listed in `.gitignore`.

### Running with Docker (Recommended)

```bash
# Build all images and start the full stack
docker compose up --build

# Verify services are running
docker compose ps
```

All database migrations run automatically on startup.

### Health Checks

Once running, verify each service:

```bash
curl http://localhost/api/ai/health    # AI Service + ai_db
curl http://localhost/api/blog/health  # Blog Service + blog_db
```

### Running Services Individually (Development)

**Auth Service:**
```bash
cd services/auth
npm install
DATABASE_URL="postgresql://postgres:postgres@localhost:5433/auth_db" npm run start:dev
```

**AI Service:**
```bash
cd services/ai-service
pip install -r requirements.txt
DATABASE_URL="postgresql+asyncpg://postgres:postgres@localhost:5434/ai_db" uvicorn app.main:app --reload
```

**Blog Service:**
```bash
cd services/blog-service
npm install
DATABASE_URL="postgresql://postgres:postgres@localhost:5435/blog_db" npm run seed  # Seed categories, tags & posts
DATABASE_URL="postgresql://postgres:postgres@localhost:5435/blog_db" npm run dev   # Start dev server
```

### Running Tests

**Auth Service:**
```bash
cd services/auth
npm run test        # Unit tests
npm run test:e2e    # End-to-end integration tests (Jest)
```

**Blog Service:**
```bash
cd services/blog-service
npm run test        # Jest unit & integration tests
npm run test:e2e    # Standalone E2E API verification runner
```

### Database Migrations (Manual)

**Auth / Blog (Prisma):**
```bash
# Auth
cd services/auth
DATABASE_URL="postgresql://postgres:postgres@localhost:5433/auth_db" npx prisma migrate dev --name <name>

# Blog
cd services/blog-service
DATABASE_URL="postgresql://postgres:postgres@localhost:5435/blog_db" npx prisma migrate dev --name <name>
```

**AI Service (Alembic):**
```bash
cd services/ai-service
DATABASE_URL="postgresql+asyncpg://postgres:postgres@localhost:5434/ai_db" alembic revision --autogenerate -m "<name>"
DATABASE_URL="postgresql+asyncpg://postgres:postgres@localhost:5434/ai_db" alembic upgrade head
```

---

## Project Progress

### Infrastructure
- [x] Monorepo structure
- [x] Docker Compose orchestration
- [x] Nginx API Gateway
- [x] Internal Docker networking (`microservices-network`)
- [x] Health checks on all database containers
- [x] Persistent Docker volumes for all databases
- [x] Environment variable configuration (`.env.example`)
- [x] Redis container (running, not yet used by services)
- [ ] Production deployment configuration
- [ ] CI/CD pipeline

### Auth + Realtime Service
- [x] NestJS application
- [x] Prisma ORM integration
- [x] `User` model with roles
- [x] `RefreshToken` model
- [x] `bcrypt` dependency
- [x] WebSocket Gateway (Socket.IO)
- [x] Connection / disconnection handling
- [x] Prisma migration on startup
- [x] Login / register endpoints
- [x] JWT issuance and validation
- [x] Refresh token rotation
- [x] GitHub OAuth 2.0 integration
- [x] Interactive OpenAPI / Swagger UI (`/docs`)
- [x] End-to-end test suite (Jest)
- [x] RBAC guards
- [ ] WebSocket authentication

### AI / LLM Service
- [x] FastAPI application
- [x] SQLAlchemy async setup with `asyncpg`
- [x] Alembic migrations
- [x] `Conversation` and `Message` database models
- [x] `/health` endpoint with DB ping
- [x] OpenAI + Anthropic SDK dependencies
- [ ] LLM completion endpoints
- [ ] Conversation history API
- [ ] Token usage tracking

### Blog Service
- [x] Fastify application & clean modular structure
- [x] Prisma ORM integration
- [x] `Post`, `Category`, `Tag`, `Comment` models
- [x] SEO metadata, auto-slugs (`slugify`), view counts, featured flags
- [x] `@fastify/jwt` registered for token verification
- [x] `jwtGuard` and RBAC guards (`ADMIN`, author ownership)
- [x] `/health` endpoint with DB ping
- [x] Prisma migration on startup
- [x] Database seeder (`npm run seed`)
- [x] Post CRUD endpoints (pagination, search, filter, slug lookup)
- [x] Category / Tag management with post count aggregation
- [x] Interactive OpenAPI / Swagger UI (`/docs`)
- [x] Unit & integration test suites (Jest)
- [x] Standalone E2E verification test runner
- [ ] Comment CRUD endpoints

### Architecture
- [x] Database-per-service isolation
- [x] Three independent PostgreSQL instances
- [x] Service communication via internal HTTP
- [x] JWT for cross-service user identity
- [ ] Message broker / event bus
- [ ] Centralized logging
- [ ] Distributed tracing

---

## Current vs. Future Architecture

### Current Architecture ✅

- **3 microservices** running in Docker: Auth (NestJS), AI (FastAPI), Blog (Fastify)
- **Nginx API Gateway** routing requests by path prefix
- **3 isolated PostgreSQL databases** — one per service
- **Redis** container provisioned (not yet integrated into application logic)
- **WebSocket** infrastructure in the Auth service via Socket.IO
- **JWT-based identity** passed across service boundaries via token payload

### Future Architecture ⏳

- **Redis pub/sub** for real-time event propagation between services
- **Message broker** (e.g., RabbitMQ or Kafka) for async AI job processing
- **Service discovery** for dynamic service resolution
- **Centralized structured logging** (e.g., Loki + Grafana)
- **Distributed tracing** (e.g., OpenTelemetry)
- **Kubernetes** for horizontal scaling and orchestration
- **CI/CD pipeline** for automated testing and deployment

---

## Architecture Principles

| Principle | Implementation |
|---|---|
| **Database per service** | Each service has its own PostgreSQL instance |
| **Loose coupling** | Services communicate via HTTP/WebSocket, not shared databases |
| **High cohesion** | Auth and WebSocket are co-located due to shared authentication context |
| **Independent deployment** | Each service has its own Dockerfile and can be rebuilt independently |
| **Service ownership** | Each service is the single source of truth for its domain data |
| **Stateless services** | Services hold no in-memory session state; JWT is self-contained |
| **Environment-based config** | All secrets and URLs are injected via environment variables |
| **Containerized deployment** | Docker Compose orchestrates the full stack |
| **Security by default** | Passwords hashed, secrets in env, databases isolated |
| **Reproducible migrations** | Migrations run automatically on container start |

---

## Technology Stack

| Layer | Technology | Version | Status |
|---|---|---|---|
| Auth / Realtime | NestJS | v11 | ✅ Active |
| AI / LLM | FastAPI | 0.110 | ✅ Active |
| Blog | Fastify | v4 | ✅ Active |
| Language (Auth/Blog) | TypeScript | v5 | ✅ Active |
| Language (AI) | Python | 3.11 | ✅ Active |
| Database | PostgreSQL | 15 | ✅ Active |
| ORM (Auth/Blog) | Prisma | v5 | ✅ Active |
| ORM (AI) | SQLAlchemy + Alembic | 2.x | ✅ Active |
| Realtime | Socket.IO | v4 | ✅ Active |
| API Gateway | Nginx | latest | ✅ Active |
| Cache / Broker | Redis | v7 | 🚧 Provisioned, not integrated |
| LLM Providers | OpenAI / Anthropic | Latest | 🚧 SDKs installed |
| Containerization | Docker + Compose | v3 | ✅ Active |
