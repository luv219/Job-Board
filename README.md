# Job Board

A production-oriented TypeScript MERN foundation for a future niche job board. Phase 0 establishes the repository, runtime safeguards, and developer workflow; it intentionally contains no job-board business functionality.

## Architecture

```text
React web application → Express API → MongoDB
```

The codebase is a small npm-workspaces modular monolith:

- `apps/web` — React 19 + Vite client.
- `apps/api` — Express 5 API, MongoDB lifecycle, security middleware, and health checks.
- `packages/contracts` — shared public API contracts (currently health responses only).

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

Set `MONGODB_URI` in `.env` to a local MongoDB instance. The example is safe for local development and contains no secret.

## Local development

Start MongoDB separately, then run:

```bash
npm run dev
```

The web app is served at `http://localhost:5173`; the API listens on `http://localhost:3000` by default. Individual applications can be started with `npm run dev:web` and `npm run dev:api`.

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

- `GET /api/v1/health/live` — reports whether the API process is running; never waits for MongoDB.
- `GET /api/v1/health/ready` — reports readiness and returns `503` until MongoDB is connected.

## Repository structure

```text
apps/             Deployable web and API applications
packages/         Shared public contracts
docs/architecture/ Architecture decisions and future seams
docker/           Application Dockerfiles
.github/workflows/ CI quality gate
```

## Phase 0 status and intentionally deferred work

Implemented: workspace foundation, operational health endpoints, validation, security baseline, structured logging, graceful shutdown, Docker development, tests, and CI.

Deferred: authentication, user/company/job/application models and workflows, resumes and storage providers, email, job search, dashboards, caching, queues, analytics, payments, and all other product features. See [the architecture document](docs/architecture/architecture.md) for scale-up seams.
