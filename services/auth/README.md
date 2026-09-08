# GitRabbit Auth & Realtime Service

Production-ready Authentication, User Identity, and Realtime WebSocket service built with NestJS, Prisma ORM, and PostgreSQL.

---

## Features

- **User Authentication**: Secure email/password registration and authentication with `bcrypt` password hashing.
- **JWT & Token Lifecycle**: Short-lived JWT access tokens with secure refresh token rotation and cookie persistence.
- **GitHub OAuth 2.0**: Seamless social login linking or provisioning user accounts automatically.
- **Role-Based Access Control (RBAC)**: Enum-based role authorization (`USER`, `ADMIN`) with NestJS guards.
- **Realtime Gateway**: Built-in Socket.IO gateway with connection handling and ping/pong events.
- **Interactive OpenAPI / Swagger Documentation**: Full OpenAPI 3.0 specification available at `/docs` with Swagger UI.
- **Automated Database Migrations**: Self-applying Prisma migrations running against isolated `auth_db`.
- **E2E Testing Suite**: Comprehensive end-to-end test coverage with Jest and Supertest.

---

## Tech Stack

- **Framework**: NestJS v11
- **Language**: TypeScript v5
- **ORM**: Prisma v5
- **Database**: PostgreSQL 15 (`auth_db`, port `5433` local / `5432` container)
- **Realtime**: Socket.IO / `@nestjs/platform-socket.io`
- **Documentation**: `@nestjs/swagger` (Swagger UI)
- **Validation**: `class-validator` & `class-transformer`

---

## Prerequisites

- [Node.js](https://nodejs.org/) v20+
- [PostgreSQL](https://www.postgresql.org/) v15+ (or run via Docker Compose)
- `npm` v10+

---

## Configuration

The service reads configuration from environment variables (or `.env` in the repository root / service directory):

| Variable | Description | Default / Example |
|---|---|---|
| `PORT` | HTTP server port | `3000` |
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://postgres:postgres@localhost:5433/auth_db` |
| `JWT_SECRET` / `JWT_ACCESS_SECRET` | Secret key for signing access tokens | `super_secret_jwt_key` |
| `JWT_REFRESH_SECRET` | Secret key for signing refresh tokens | `super_secret_refresh_key` |
| `GITHUB_CLIENT_ID` | GitHub OAuth application Client ID | `your_github_client_id` |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth application Client Secret | `your_github_client_secret` |
| `GITHUB_CALLBACK_URL` | GitHub OAuth redirect URI | `http://localhost:3000/auth/github/callback` |

---

## Installation & Running

```bash
# Install dependencies
npm install

# Run database migrations
npx prisma migrate dev

# Start development server with hot-reload
npm run start:dev

# Start production build
npm run build
npm run start:prod
```

---

## API Endpoints

Interactive Swagger documentation is available at **`http://localhost:3000/docs`** (or via gateway at `http://localhost/api/auth/docs`).

| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| `GET` | `/` | Service health status | No |
| `POST` | `/auth/register` | Register new user account | No |
| `POST` | `/auth/login` | Authenticate user & receive access token + refresh cookie | No |
| `POST` | `/auth/refresh` | Rotate refresh token and issue new access token | Refresh Cookie |
| `POST` | `/auth/logout` | Revoke refresh token and invalidate cookie | Yes (Bearer JWT) |
| `GET` | `/auth/github` | Initiate GitHub OAuth 2.0 flow | No |
| `GET` | `/auth/github/callback` | GitHub OAuth redirect and authentication handler | No |
| `GET` | `/auth/me` | Retrieve authenticated user profile claims | Yes (Bearer JWT) |
| `GET` | `/docs` | Interactive Swagger / OpenAPI documentation UI | No |
| `GET` | `/docs-json` | OpenAPI 3.0 specification JSON | No |

---

## Testing

```bash
# Run unit tests
npm run test

# Run end-to-end integration tests
npm run test:e2e

# Run test coverage
npm run test:cov
```
