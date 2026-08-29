# Job Board

A production-oriented TypeScript MERN modular monolith for a niche job board. Phase 4 provides the secure employer Job-management and public Job-detail foundation; applications and public Job search remain deliberately deferred.

## Architecture

```text
React web application → Express API → MongoDB
```

The codebase is a small npm-workspaces modular monolith:

- `apps/web` — React 19 + Vite client.
- `apps/api` — Express 5 API, MongoDB lifecycle, security middleware, and health checks.
- `packages/contracts` — small shared public API contracts and controlled Job enums.

## Stack

Node.js 24 LTS, TypeScript, React 19, Vite, Express 5, MongoDB/Mongoose, Zod, Pino, ESLint, Vitest, Supertest, Docker Compose, and GitHub Actions.

## Prerequisites

- Node.js 24 LTS and npm 11+
- Docker Desktop (optional, for the containerized environment)

## Installation and environment

```bash
npm install
Copy-Item .env.example .env
```

Set `MONGODB_URI` in `.env` to a local MongoDB instance. `API_HOST`, `API_PORT`, `WEB_ORIGIN`, `LOG_LEVEL`, and `REQUEST_BODY_LIMIT` are validated at startup. The example is safe for local development and contains no secret.

## Local development

Start MongoDB separately, then run:

```bash
npm run dev
```

The web app is served at `http://localhost:5173`; the API listens on `http://localhost:3000` by default. Individual applications can be started with `npm run dev:web` and `npm run dev:api`. API startup requires a reachable MongoDB; Docker Compose handles that dependency automatically.

## Docker development

```bash
docker compose up --build
```

Compose runs `web`, `api`, and an internal-only `mongodb` service. MongoDB data is retained in the `mongodb_data` named volume and is deliberately not exposed to the host.

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Run web and API development servers together |
| `npm run dev:web` / `npm run dev:api` | Run one application |
| `npm run build` | Build every workspace |
| `npm run lint` | Lint every workspace |
| `npm run typecheck` | Strict TypeScript verification |
| `npm run test` | Run API contract tests |

## Health endpoints

- `GET /api/v1/health/live` — reports whether the API process is running; never depends on MongoDB.
- `GET /api/v1/health/ready` — returns `200` with MongoDB status when connected, otherwise `503` with a safe unavailable status.

All future API routes use `/api/v1`. Controlled errors include a stable code, a safe message, and `X-Request-Id` correlation value.

## Authentication API

| Method | Route | Purpose |
| --- | --- | --- |
| `POST` | `/api/v1/auth/register` | Register and authenticate an Applicant or Employer account |
| `POST` | `/api/v1/auth/login` | Authenticate using email/password |
| `POST` | `/api/v1/auth/refresh` | Rotate the HttpOnly refresh credential and obtain an access token |
| `POST` | `/api/v1/auth/logout` | Revoke the active refresh session and clear its cookie |
| `GET` | `/api/v1/auth/me` | Retrieve the current account using a bearer access token |

The access token is returned in the response and is intended for short-lived in-memory client use. The opaque refresh credential is sent only in an HttpOnly, same-site cookie. Registration authenticates the account immediately; email verification delivery, password resets, OAuth, and MFA are intentionally deferred.

## Profile, company, and Job API

Applicants manage only `/api/v1/applicant/profile`; employers manage only `/api/v1/employer/profile` and `/api/v1/employer/company`. `GET /api/v1/companies/:slug` exposes a deliberately public company representation. Profiles are private, and each Employer initially owns one Company.

Jobs are a separate collection that reference their Company and creator; they are never embedded in a Company. Employers can create and manage only their own Company's Jobs through these role-protected routes:

| Method | Route | Purpose |
| --- | --- | --- |
| `POST` | `/api/v1/employer/jobs` | Create a server-owned `DRAFT` Job |
| `GET` | `/api/v1/employer/jobs` | List only the Employer's Jobs (`status`, `page`, `limit`, `sort`) |
| `GET` | `/api/v1/employer/jobs/:jobId` | Retrieve an owned Job |
| `PATCH` | `/api/v1/employer/jobs/:jobId` | Edit content on `DRAFT` or `PUBLISHED` Jobs |
| `POST` | `/api/v1/employer/jobs/:jobId/publish` | Publish a Draft |
| `POST` | `/api/v1/employer/jobs/:jobId/close` | Close a Published Job |
| `POST` | `/api/v1/employer/jobs/:jobId/archive` | Archive a Draft or Closed Job |
| `GET` | `/api/v1/jobs/:slug` | Retrieve one public Published Job |

Job slugs are generated once by the server and stay stable when a title changes. The lifecycle is `DRAFT → PUBLISHED → CLOSED → ARCHIVED`, with `DRAFT → ARCHIVED` also supported; all lifecycle actions use conditional database updates. Public detail returns only Published Jobs with an unexpired deadline, excludes employer identity and Company ownership data, and omits salary whenever `salary.visible` is false. A passed deadline does not change stored status during reads.

## Repository structure

```text
apps/             Deployable web and API applications
packages/         Shared public contracts
docs/architecture/ Architecture decisions and future seams
docker/           Application Dockerfiles
.github/workflows/ CI quality gate
```

## Phase 4 status and intentionally deferred work

Implemented: workspace foundation, API lifecycle separation, strict configuration, MongoDB lifecycle handling, standardized health/error responses, request validation and query-safety primitives, security middleware, request correlation, bounded shutdown/timeouts, Docker health checks, isolated test-database guardrails, password authentication, rotating refresh sessions, RBAC primitives, private profiles/companies, and core employer Job lifecycle management.

Deferred: public Job listing/search/filtering, applications, saved jobs, resumes and storage providers, email, dashboards, company teams, caching, queues, analytics, payments, and all other product features. See [the architecture document](docs/architecture/architecture.md) for operational conventions and scale-up seams.
