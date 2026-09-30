# 🐰 GitRabbit Backend Architecture & Frontend Integration Blueprint (`step.md`)

This document is the authoritative implementation specification aligning the **GitRabbit Next.js frontend** (`frontend/gitrabbit_frontend`) with the **`backend-v2` microservices architecture**.

---

## 1. Architectural Foundations & Principles (`backend-v2`)

The backend follows the core architectural principles defined in [`backend-v2/README.md`](file:///home/dev_shakib/Projects/gitrabbit/backend-v2/README.md):

1. **Database-per-Service Isolation**: Each service exclusively owns its own PostgreSQL database. **No service ever queries another service's database directly**.
2. **Stateless JWT-Based Identity Propagation**:
   - The Auth Service signs JWT access tokens containing `{ sub: userId, email, role }`.
   - Downstream services (`blog-service`, `ai-service`, `core-service`) verify token signatures locally using the shared `JWT_SECRET`.
   - User identity is referenced as `authorId`, `user_id`, or `userId` as an unconstrained foreign key in downstream tables.
3. **Single Entry Point (API Gateway)**: An Nginx reverse proxy on Port 80 routes all incoming client traffic by path prefix.
4. **Co-located Auth + WebSocket**: WebSocket/Socket.IO connections are terminated in the Auth Service (`:3000`) because Socket.IO handshakes share the same JWT authentication context.
5. **Containerized Reproducibility**: Every service has its own `Dockerfile`, runs automatic database migrations on startup (`prisma migrate deploy` or `alembic upgrade head`), and connects through the internal `microservices-network` bridge.

---

## 2. Target Microservices Topology

```mermaid
graph TD
    Client(["🖥️ Frontend Client (Next.js 16 · Port 3000)"])
    GW["API Gateway (Nginx · Port 80)"]

    subgraph Auth ["Auth + Realtime Service (NestJS · Port 3000)"]
        AuthSvc["Auth, RBAC, Sessions\nSocket.IO Gateway & Chat Rooms"]
        AuthDB[("auth_db\nPostgreSQL :5433")]
    end

    subgraph Core ["Core Platform Service (NestJS · Port 3001)"]
        CoreSvc["Repos, Pull Requests, Reviews\nCoins Ledger, Team RBAC, Reports, Settings"]
        CoreDB[("core_db\nPostgreSQL :5436")]
    end

    subgraph AI ["AI / LLM Service (FastAPI · Port 8000)"]
        AISvc["Code Analysis, AST Scanning\nLLM Suggestions & Diffs (OpenAI/Anthropic)"]
        AIDB[("ai_db\nPostgreSQL :5434")]
    end

    subgraph Blog ["Blog Service (Fastify · Port 4000)"]
        BlogSvc["Posts, Categories, Tags, Comments\nSEO & Views Tracking"]
        BlogDB[("blog_db\nPostgreSQL :5435")]
    end

    subgraph Broker ["Message Broker & Cache"]
        Redis[("Redis v7 · Port 6379\nPub/Sub & Task Queue")]
    end

    Client --> GW
    GW -- "/api/auth/*" --> AuthSvc
    GW -- "/socket.io/*" --> AuthSvc
    GW -- "/api/core/*" --> CoreSvc
    GW -- "/api/billing/*" --> CoreSvc
    GW -- "/api/ai/*" --> AISvc
    GW -- "/api/blog/*" --> BlogSvc

    AuthSvc --> AuthDB
    CoreSvc --> CoreDB
    AISvc --> AIDB
    BlogSvc --> BlogDB

    CoreSvc -. "Internal HTTP / Tasks" .-> AISvc
    AuthSvc -. "Presence / PubSub" .-> Redis
    CoreSvc -. "Events" .-> Redis
```

### Port Allocation & Service Registry

| Service | Framework | Language | ORM | Database | Local DB Port | Service Internal Port | Gateway Route |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Gateway** | Nginx | — | — | — | — | `80` | `/` |
| **Auth + Realtime** | NestJS v11 | TypeScript | Prisma v5 | `auth_db` | `5433` | `3000` | `/api/auth/*`, `/socket.io/*` |
| **AI / LLM** | FastAPI | Python 3.11 | SQLAlchemy + Alembic | `ai_db` | `5434` | `8000` | `/api/ai/*` |
| **Blog** | Fastify v4 | TypeScript | Prisma v5 | `blog_db` | `5435` | `4000` | `/api/blog/*` |
| **Core Platform** | NestJS v11 | TypeScript | Prisma v5 | `core_db` | `5436` | `3001` | `/api/core/*`, `/api/billing/*` |
| **Redis** | Redis 7 | — | — | In-memory | `6379` | `6379` | Internal only |

---

## 3. Gateway Configuration (`gateway/nginx.conf`)

Update [`gateway/nginx.conf`](file:///home/dev_shakib/Projects/gitrabbit/backend-v2/gateway/nginx.conf) to support the complete API surface:

```nginx
worker_processes auto;

events {
    worker_connections 1024;
}

http {
    include       mime.types;
    default_type  application/octet-stream;
    sendfile      on;
    keepalive_timeout 65;

    # CORS configuration
    map $http_origin $cors_origin {
        default "";
        "~^https?://localhost(:[0-9]+)?$" "$http_origin";
    }

    server {
        listen 80;
        server_name localhost;
d
        # 1. Auth Service
        location /api/auth/ {
            proxy_pass http://auth-service:3000/auth/;
            proxy_http_version 1.1;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }

        # 2. WebSocket Gateway (Socket.IO terminated at Auth Service)
        location /socket.io/ {
            proxy_pass http://auth-service:3000/socket.io/;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection "Upgrade";
            proxy_set_header Host $host;
        }

        # 3. Core Platform Service (Repositories, PRs, Reviews, Coins, Team)
        location /api/core/ {
            proxy_pass http://core-service:3001/api/core/;
            proxy_http_version 1.1;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        }

        # 4. Billing & Coins Ledger (Routed to Core Service)
        location /api/billing/ {
            proxy_pass http://core-service:3001/api/billing/;
            proxy_http_version 1.1;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
        }

        # 5. AI / LLM Service
        location /api/ai/ {
            proxy_pass http://ai-service:8000/api/;
            proxy_http_version 1.1;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
        }

        # 6. Blog Service
        location /api/blog/ {
            proxy_pass http://blog-service:4000/;
            proxy_http_version 1.1;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }
    }
}
```

---

## 4. Frontend-to-Backend Detailed Domain Specifications

### Domain A: Authentication & Identity (`services/auth`)
**Frontend Views:** [`app/login/page.tsx`](file:///home/dev_shakib/Projects/gitrabbit/frontend/gitrabbit_frontend/app/login/page.tsx), [`app/signup/page.tsx`](file:///home/dev_shakib/Projects/gitrabbit/frontend/gitrabbit_frontend/app/signup/page.tsx), [`SettingsTab.tsx`](file:///home/dev_shakib/Projects/gitrabbit/frontend/gitrabbit_frontend/components/dashboard/tabs/SettingsTab.tsx)

#### Already Implemented Endpoints:
- `POST /api/auth/register` — Validates input, hashes password with `bcrypt`, stores `User`, returns `{ user, accessToken }` and sets HTTP-only `Refresh` cookie.
- `POST /api/auth/login` — Verifies credentials, returns `{ user, accessToken }`, sets `Refresh` cookie.
- `POST /api/auth/refresh` — Rotates refresh token in `RefreshToken` table and returns new `accessToken`.
- `POST /api/auth/logout` — Revokes refresh token in `auth_db`.
- `GET /api/auth/me` — Returns authenticated user profile (`id`, `name`, `email`, `role`).
- `GET /api/auth/github` & `/api/auth/github/callback` — GitHub OAuth 2.0 flow.

#### Additions Implemented:
- `POST /api/auth/verify-token` — Validates admin dashboard token for Superadmin page.
- `PATCH /api/auth/profile` — Updates user profile name, email, avatar URL from Settings Tab.
- `POST /api/auth/send-verification-email` — Dispatches an email verification link with a 24h token.
- `POST /api/auth/verify-email` & `GET /api/auth/verify-email?token=` — Verifies user email and redirects to login.
- `POST /api/auth/forgot-password` — Dispatches a secure 1-hour password reset link via SMTP email.
- `POST /api/auth/reset-password` — Sets a new password, validates complexity, marks email verified, and revokes old sessions.
- `POST /api/auth/forgot-username` — Sends account username and display name details to the registered email address.

---

### Domain B: Blog & Content Management (`services/blog-service`)
**Frontend Views:** [`app/blog/page.tsx`](file:///home/dev_shakib/Projects/gitrabbit/frontend/gitrabbit_frontend/app/blog/page.tsx), [`app/blog/[id]/page.tsx`](file:///home/dev_shakib/Projects/gitrabbit/frontend/gitrabbit_frontend/app/blog/[id]/page.tsx)

#### Already Implemented Endpoints (Fastify + Prisma):
- `GET /api/blog/posts?page=1&limit=9&category=&tag=&search=&published=true` — Paginated post list with search and taxonomy filtering.
- `GET /api/blog/posts/slug/:slug` — Single article view (automatically increments `views` count).
- `GET /api/blog/categories` — Categories with aggregate `_count.posts`.
- `GET /api/blog/tags` — Tags with aggregate `_count.posts`.
- `POST /api/blog/posts` — Protected by JWT guard + RBAC (`ADMIN` / author).
- `PUT /api/blog/posts/:id` & `DELETE /api/blog/posts/:id` — Author or `ADMIN` guarded.

#### Frontend Transition Action:
- Replace static mock data import from [`lib/blog-data.ts`](file:///home/dev_shakib/Projects/gitrabbit/frontend/gitrabbit_frontend/lib/blog-data.ts) with direct SWR / React Query calls to `/api/blog/posts`.
- Connect dynamic route `/blog/[id]` to query `/api/blog/posts/slug/:slug`.

---

### Domain C: AI Review & Code Intelligence (`services/ai-service`)
**Frontend Views:** [`ChatTab.tsx`](file:///home/dev_shakib/Projects/gitrabbit/frontend/gitrabbit_frontend/components/dashboard/tabs/ChatTab.tsx), [`SuggestionsTab.tsx`](file:///home/dev_shakib/Projects/gitrabbit/frontend/gitrabbit_frontend/components/dashboard/tabs/SuggestionsTab.tsx), Codebase Scan in [`RepositoriesTab.tsx`](file:///home/dev_shakib/Projects/gitrabbit/frontend/gitrabbit_frontend/components/dashboard/tabs/RepositoriesTab.tsx)

#### Existing Database Models (`services/ai-service/app/db/models.py`):
- `Conversation` (`id`, `user_id`, `model_name`, `created_at`, `updated_at`)
- `Message` (`id`, `conversation_id`, `role`, `content`, `token_usage`, `created_at`)

#### Endpoints to Implement in FastAPI:
- `POST /api/ai/conversations` — Start a new LLM conversation thread.
- `POST /api/ai/conversations/{id}/messages` — Send message and receive LLM response (or SSE streaming).
- `POST /api/ai/scan` — AST Codebase & Security Scanner:
  - **Input:** `{ repoId: string, files: [{ path: string, content: string }] }`
  - **Output:** `{ issuesFound: number, healthScore: number, suggestions: Suggestion[] }`
- `POST /api/ai/suggestions/generate` — Generate structured before/after code refactor diffs:
  - Categorized into `Performance`, `Security`, `Refactoring`.
  - Calculates Rabbit Coins cost (`cost: number`) and impact explanation.

---

### Domain D: Real-Time Chat, Alerts & Presence (`services/auth/src/websocket`) — ✅ IMPLEMENTED & VERIFIED
**Frontend Views:** [`ChatTab.tsx`](file:///home/dev_shakib/Projects/gitrabbit/frontend/gitrabbit_frontend/components/dashboard/tabs/ChatTab.tsx)

The Socket.IO Gateway is co-located in the Auth Service (`:3000`), terminating at `/socket.io/`.
- **Database Persistence (`schema.prisma`):**
  - `ChatMessage`: `id`, `channelId`, `userId`, `content`, `type`, `isPinned`, `createdAt`, `updatedAt`
  - `ChatReaction`: `id`, `messageId`, `userId`, `emoji`, `createdAt` (with `@@unique([messageId, userId, emoji])`)
- **Connection Handshake:** Client connects via `socket.io-client` sending JWT in auth handshake or Bearer header:
  ```ts
  const socket = io("http://localhost", {
    path: "/socket.io",
    auth: { token: accessToken }
  });
  ```
- **Socket Events Implemented:**
  - `connected` ➔ Handshake acknowledgment returning authenticated `user`, default `channels`, and active `members`.
  - `join_channel` / `joined_channel` ➔ Joins channel room and streams recent `channel_messages`.
  - `leave_channel` / `left_channel` ➔ Leaves channel room.
  - `get_channel_messages` ➔ Retrieves paginated channel history.
  - `send_message` / `new_message` ➔ Validates payload via class-validator, persists to Neon DB, broadcasts to channel room.
  - `message_reaction` / `reaction_updated` ➔ Atomically toggles user reaction in DB and broadcasts aggregated counts `[{ emoji, count, reacted }]`.
  - `pin_message` / `message_pinned` ➔ Toggles pinned flag in DB and broadcasts update.
  - `delete_message` / `message_deleted` ➔ Verifies author/admin permission, removes from DB, broadcasts event.
  - `user_presence` / `presence_updated` ➔ Updates user status (`online` / `away` / `offline`) and broadcasts updated team roster.
  - `typing_start` / `typing_stop` ➔ Broadcasts `user_typing` indicator.
  - `ai_alert` ➔ Dispatches AI scan findings into `#ai-alerts` and broadcasts `global_alert`.
  - `ping` / `pong` ➔ Heartbeat latency checking.
- **Error Handling:** Standardized error payloads via `WebsocketExceptionsFilter`.
- **Integration Tests:** 7/7 e2e tests passing in `websocket.e2e-spec.ts`.

---

### Domain E: Core Platform Service (`services/core-service`)
**Frontend Views:** Dashboard Overview, Repositories, Pull Requests, Reviews, Team, Billing, Reports, Settings.

To maintain strict **database isolation**, we instantiate `core-service` (NestJS) backed by `core_db` (Postgres on port `5436`).

#### Database Schema (`services/core-service/prisma/schema.prisma`):

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

enum Provider {
  GITHUB
  GITLAB
  BITBUCKET
}

enum HealthStatus {
  EXCELLENT
  FAIR
  CRITICAL
}

enum PRStatus {
  OPEN
  MERGED
  CLOSED
}

enum ReviewStatus {
  PENDING
  RUNNING
  COMPLETED
}

enum SuggestionCategory {
  PERFORMANCE
  SECURITY
  REFACTORING
}

enum CoinTxType {
  EARN
  SPEND
}

enum TeamRole {
  OWNER
  ADMIN
  REVIEWER
  DEVELOPER
  VIEWER
}

model Repository {
  id           String         @id @default(uuid())
  userId       String         // Auth Service User reference
  name         String
  provider     Provider       @default(GITHUB)
  health       HealthStatus   @default(EXCELLENT)
  issuesCount  Int            @default(0)
  lastScan     DateTime?
  isPrivate    Boolean        @default(true)
  languages    Json           // Array of { name, percentage, color }
  pullRequests PullRequest[]
  createdAt    DateTime       @default(now())
  updatedAt    DateTime       @updatedAt
}

model PullRequest {
  id           String         @id @default(uuid())
  repoId       String
  repository   Repository     @relation(fields: [repoId], references: [id], onDelete: Cascade)
  prNumber     Int
  title        String
  author       String
  status       PRStatus       @default(OPEN)
  reviewStatus ReviewStatus   @default(PENDING)
  highIssues   Int            @default(0)
  mediumIssues Int            @default(0)
  lowIssues    Int            @default(0)
  reviews      Review[]
  createdAt    DateTime       @default(now())
  updatedAt    DateTime       @updatedAt
}

model Review {
  id             String         @id @default(uuid())
  pullRequestId  String
  pullRequest    PullRequest    @relation(fields: [pullRequestId], references: [id], onDelete: Cascade)
  author         String
  avatar         String
  approvalStatus String         // "Approved" | "Requested Changes" | "Commented"
  summary        String
  bugsCaught     Int            @default(0)
  securityVulns  Int            @default(0)
  comments       ReviewComment[]
  createdAt      DateTime       @default(now())
}

model ReviewComment {
  id          String   @id @default(uuid())
  reviewId    String
  review      Review   @relation(fields: [reviewId], references: [id], onDelete: Cascade)
  file        String
  line        Int
  issue       String
  suggestion  String
  createdAt   DateTime @default(now())
}

model Suggestion {
  id          String             @id @default(uuid())
  repoId      String
  category    SuggestionCategory
  file        String
  description String
  impact      String
  cost        Int                @default(5)
  oldCode     String
  newCode     String
  isApplied   Boolean            @default(false)
  isIgnored   Boolean            @default(false)
  createdAt   DateTime           @default(now())
}

model CoinLedger {
  id          String     @id @default(uuid())
  userId      String     @index // Auth User reference
  type        CoinTxType
  amount      Int
  description String
  createdAt   DateTime   @default(now())
}

model TeamMember {
  id             String    @id @default(uuid())
  workspaceId    String    @default("default")
  userId         String    // Auth User reference
  name           String
  email          String
  github         String?
  role           TeamRole  @default(DEVELOPER)
  avatar         String
  prsReviewed    Int       @default(0)
  fixesApproved  Int       @default(0)
  coinsSpent     Int       @default(0)
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt
}

model ApiKey {
  id        String    @id @default(uuid())
  userId    String    @index
  name      String
  keyHash   String
  prefix    String
  lastUsed  DateTime?
  createdAt DateTime  @default(now())
}

model Report {
  id        String    @id @default(uuid())
  userId    String
  name      String
  type      String
  size      String
  status    String    // "Ready" | "Generating" | "Outdated"
  scope     String
  createdAt DateTime  @default(now())
}
```

---

## 5. Master Endpoint Reference Table

| Path | Method | Target Service | Auth Guard | Description |
| :--- | :--- | :--- | :--- | :--- |
| **Auth** | | | | |
| `/api/auth/register` | `POST` | Auth | Public | Register new user account |
| `/api/auth/login` | `POST` | Auth | Public | Email/Password login |
| `/api/auth/refresh` | `POST` | Auth | Cookie | Rotate refresh token |
| `/api/auth/logout` | `POST` | Auth | Bearer JWT | Terminate session |
| `/api/auth/me` | `GET` | Auth | Bearer JWT | Current user profile claims |
| `/api/auth/verify-token` | `POST` | Auth | Public | Superadmin dashboard token verification |
| `/api/auth/profile` | `PATCH` | Auth | Bearer JWT | Update name, email, avatar URL |
| `/api/auth/send-verification-email`| `POST` | Auth | Public | Dispatch email verification link |
| `/api/auth/verify-email` | `POST/GET`| Auth | Public | Verify token and activate email |
| `/api/auth/forgot-password` | `POST` | Auth | Public | Send 1-hour password reset email link |
| `/api/auth/reset-password` | `POST` | Auth | Public | Reset password using verified token |
| `/api/auth/forgot-username` | `POST` | Auth | Public | Email registered username and display name |
| **Blog** | | | | |
| `/api/blog/posts` | `GET` | Blog | Public | Paginated posts (search, category, tag) |
| `/api/blog/posts/slug/:slug` | `GET` | Blog | Public | Single post view (auto-increments views) |
| `/api/blog/categories` | `GET` | Blog | Public | Categories with post counts |
| `/api/blog/tags` | `GET` | Blog | Public | Tags with post counts |
| `/api/blog/posts/:id/comments` | `GET/POST`| Blog | JWT on POST| Comment retrieval and submission |
| **Dashboard & Repos** | | | | |
| `/api/core/dashboard/stats` | `GET` | Core | Bearer JWT | Overview stat counters & % trends |
| `/api/core/dashboard/activity-chart` | `GET` | Core | Bearer JWT | PR review vs issues line chart |
| `/api/core/dashboard/issues-breakdown`| `GET` | Core | Bearer JWT | Category breakdown donut chart |
| `/api/core/repositories` | `GET/POST`| Core | Bearer JWT | List & connect repositories |
| `/api/core/repositories/:id` | `GET/DEL` | Core | Bearer JWT | Repo details / disconnect |
| `/api/core/repositories/:id/scan` | `POST` | Core ➔ AI | Bearer JWT | Trigger AST Codebase scan |
| **PRs & Reviews** | | | | |
| `/api/core/pull-requests` | `GET` | Core | Bearer JWT | List PRs with status filters |
| `/api/core/pull-requests/:id/review` | `POST` | Core ➔ AI | Bearer JWT | Re-request AI review |
| `/api/core/reviews` | `GET` | Core | Bearer JWT | List reviews & inline comments |
| **AI Suggestions** | | | | |
| `/api/ai/suggestions` | `GET` | Core / AI | Bearer JWT | Performance, Security, Refactor suggestions |
| `/api/ai/suggestions/:id/apply` | `POST` | Core ➔ AI | Bearer JWT | Deducts coins, applies fix commit |
| `/api/ai/suggestions/:id/ignore` | `POST` | Core | Bearer JWT | Dismiss suggestion |
| **Rabbit Coins & Billing** | | | | |
| `/api/billing/coins` | `GET` | Core | Bearer JWT | Wallet coin balance |
| `/api/billing/transactions` | `GET` | Core | Bearer JWT | Coin ledger transaction history |
| `/api/billing/checkout-session` | `POST` | Core | Bearer JWT | Stripe checkout for coin packs |
| `/api/billing/webhook` | `POST` | Core | Stripe Sig | Stripe payment webhook listener |
| **Team & Settings** | | | | |
| `/api/core/team/members` | `GET` | Core | Bearer JWT | Workspace members and review metrics |
| `/api/core/team/invite` | `POST` | Core | Admin JWT | Invite team member by email |
| `/api/core/api-keys` | `GET/POST`| Core | Bearer JWT | API keys management |
| `/api/core/reports` | `GET/POST`| Core | Bearer JWT | List and generate audit reports |
| `/api/core/status` | `GET` | Core | Public | Realtime system & cluster status |

---

## 6. Implementation Roadmap & Steps Checklist

### Phase 1: Environment & Gateway Setup
- [ ] Add `core-service` and `core-db` to [`docker-compose.yml`](file:///home/dev_shakib/Projects/gitrabbit/backend-v2/docker-compose.yml):
  - `core-service` running on port `3001`
  - `core-db` (Postgres 15) running on port `5436`
- [ ] Update [`gateway/nginx.conf`](file:///home/dev_shakib/Projects/gitrabbit/backend-v2/gateway/nginx.conf) with `/api/core/` and `/api/billing/` routing rules.
- [ ] Update [`.env.example`](file:///home/dev_shakib/Projects/gitrabbit/backend-v2/.env.example) and [`.env`](file:///home/dev_shakib/Projects/gitrabbit/backend-v2/.env) with core service variables:
  ```env
  CORE_DB_PORT=5436
  CORE_SERVICE_PORT=3001
  CORE_DATABASE_URL=postgresql://postgres:postgres@core-db:5432/core_db?schema=public
  ```

### Phase 2: Core Platform Service Scaffolding
- [ ] Initialize `services/core-service` (NestJS + Prisma v5).
- [ ] Add `schema.prisma` with `Repository`, `PullRequest`, `Review`, `CoinLedger`, `TeamMember`, `ApiKey`, `Report`.
- [ ] Create modules:
  - `RepositoriesModule`
  - `PullRequestsModule`
  - `ReviewsModule`
  - `CoinsModule` (Ledger + Stripe checkout)
  - `TeamModule`
  - `DashboardModule` (Aggregate stats & charts)

### Phase 3: AI Service Capabilities
- [ ] In `services/ai-service`, add endpoints:
  - `POST /api/ai/scan` (Codebase AST review)
  - `GET /api/ai/suggestions` & `POST /api/ai/suggestions/generate`
  - `POST /api/ai/chat` (LLM chat completion with memory)

### Phase 4: Frontend Dynamic Integration
- [ ] **HTTP Client**: Create Axios / Fetch API client in `frontend/gitrabbit_frontend/lib/api/client.ts` with automatic Bearer token injection and refresh interceptor.
- [ ] **Auth Pages**: Connect `app/login/page.tsx` and `app/signup/page.tsx` to `/api/auth/login` and `/api/auth/register`.
- [ ] **Dashboard State**:
  - Replace `localStorage` coins with `/api/billing/coins`.
  - Connect `RepositoriesTab.tsx` to `/api/core/repositories`.
  - Connect `PullRequestsTab.tsx` to `/api/core/pull-requests`.
  - Connect `ReviewsTab.tsx` to `/api/core/reviews`.
  - Connect `SuggestionsTab.tsx` to `/api/ai/suggestions`.
- [ ] **Realtime Chat**: Connect `ChatTab.tsx` to Socket.IO gateway (`/socket.io/`).
- [ ] **Blog**: Replace `lib/blog-data.ts` mock with `/api/blog/posts` in `app/blog/page.tsx`.
