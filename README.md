# Job Board

A production-oriented TypeScript MERN modular monolith for a niche job board. Phase 8 adds Employer Application review, a controlled hiring pipeline, and authorized immutable resume-snapshot access.

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

Set `MONGODB_URI` in `.env` to a local MongoDB instance. `API_HOST`, `API_PORT`, `WEB_ORIGIN`, `LOG_LEVEL`, and `REQUEST_BODY_LIMIT` are validated at startup. Production also requires `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET` for private resume storage. The example is safe and contains no real secret.

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

## Public Job discovery

`GET /api/v1/jobs` is public and returns concise Job cards for only active Published Jobs. Its strict query contract supports `q`, `city`, `state`, `country`, `workMode`, `employmentType`, `skills`, `salaryMin`, `salaryMax`, `currency`, `salaryPeriod`, `company`, `postedWithin`, `sort`, `page`, and `limit`.

- `q` uses MongoDB text search across title, skills, requirements, and description. It ranks title highest; it is not fuzzy search, autocomplete, or semantic search.
- Location and skills use escaped, case-insensitive exact matching. `skills` is comma-separated and uses **ANY** matching semantics.
- Salary ranges require both matching `currency` and `salaryPeriod`; only `salary.visible=true` Jobs participate, so hidden compensation never influences results.
- `company` is a public Company slug; unknown slugs return an empty result. `postedWithin` is one of `24h`, `7d`, or `30d`, based on `publishedAt`.
- Sort options are `newest`, `oldest`, and `relevance`. Keyword searches default to text relevance; otherwise results default to newest. Pagination defaults to page `1`, limit `20`, with a maximum limit of `100`.

Deep offset pagination uses `skip`/`limit` for the initial product. Cursor pagination and MongoDB Atlas Search are future scale-up options, not current infrastructure.

## Private resume API

Applicants may maintain exactly one private PDF resume after creating their Applicant profile:

| Method | Route | Purpose |
| --- | --- | --- |
| `PUT` | `/api/v1/applicant/resume` | Upload or replace one PDF (maximum 5 MiB, multipart field `resume`) |
| `GET` | `/api/v1/applicant/resume` | Retrieve safe metadata only |
| `POST` | `/api/v1/applicant/resume/access` | Generate a five-minute owner-only private download URL |
| `DELETE` | `/api/v1/applicant/resume` | Remove the active resume metadata and request provider deletion |

Files are signature-checked PDFs, stored as Cloudinary `raw` private assets, and never stored in MongoDB. MongoDB contains only non-secret metadata and an opaque provider asset ID; it never contains file bytes, permanent/public URLs, signed URLs, or provider credentials. The access route sends `Cache-Control: private, no-store`. In development without Cloudinary configuration the API remains usable but resume operations return a safe storage-not-configured response; test coverage injects an in-memory fake provider.

## Applicant Application API

Applicants can submit exactly one Application per eligible Published Job after creating a profile and uploading a current resume:

| Method | Route | Purpose |
| --- | --- | --- |
| `POST` | `/api/v1/jobs/:jobId/applications` | Submit an Application with an optional plain-text cover letter (5,000 characters maximum) |
| `GET` | `/api/v1/applicant/applications` | List only the authenticated Applicant’s Applications (`status`, `page`, `limit`) |
| `GET` | `/api/v1/applicant/applications/:applicationId` | Retrieve one owned Application |
| `POST` | `/api/v1/applicant/applications/:applicationId/withdraw` | Withdraw an active Application |

Submission accepts only currently public/active Published Jobs. It atomically reserves the unique `(jobId, applicantUserId)` pair before creating a distinct private resume snapshot. Replacing or deleting the Applicant’s current resume cannot alter an existing Application snapshot. Applicants can see all review statuses and may withdraw while the Application is active (`SUBMITTED`, `UNDER_REVIEW`, `SHORTLISTED`, `INTERVIEW`, or `OFFER`); withdrawal retains the Application and snapshot, and reapplication is intentionally disallowed.

## Employer Application review API

An Employer must own a Company, the requested Job must belong to that Company, and every Application must belong to that Job before a review route succeeds. Cross-Company access is deliberately returned as `404`.

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/api/v1/employer/jobs/:jobId/applications` | List an owned Job’s Applications (`status`, `page`, `limit`) with safe candidate summaries |
| `GET` | `/api/v1/employer/applications/:applicationId` | Read a full authorized Application/candidate review view |
| `PATCH` | `/api/v1/employer/applications/:applicationId/status` | Move an Application through the explicit hiring pipeline |
| `POST` | `/api/v1/employer/applications/:applicationId/resume/access` | Generate a five-minute, snapshot-only private download URL |

The Employer-controlled transition map is: `SUBMITTED → UNDER_REVIEW | SHORTLISTED | REJECTED`; `UNDER_REVIEW → SHORTLISTED | REJECTED`; `SHORTLISTED → INTERVIEW | REJECTED`; `INTERVIEW → OFFER | REJECTED`; `OFFER → HIRED | REJECTED`. `HIRED`, `REJECTED`, and `WITHDRAWN` are terminal. Updates use an expected-status conditional database update to prevent lost-transition races.

List responses expose only candidate name, optional headline, location, skills, and safe snapshot metadata. Detail additionally includes the Applicant’s profile content and cover letter, but never User credentials, email, current-resume metadata, provider asset IDs, or raw resume data. Resume access targets only the immutable Application snapshot and sends `Cache-Control: private, no-store`; it remains available to the authorized owning Employer after withdrawal or a terminal decision so the retained hiring record is reviewable.

## Repository structure

```text
apps/             Deployable web and API applications
packages/         Shared public contracts
docs/architecture/ Architecture decisions and future seams
docker/           Application Dockerfiles
.github/workflows/ CI quality gate
```

## Phase 8 status and intentionally deferred work

Implemented: workspace foundation, API lifecycle separation, strict configuration, MongoDB lifecycle handling, standardized health/error responses, request validation and query-safety primitives, security middleware, request correlation, bounded shutdown/timeouts, Docker health checks, isolated test-database guardrails, password authentication, rotating refresh sessions, RBAC primitives, private profiles/companies, Job discovery, private resume management, Applicant Job submission/history/withdrawal, and Employer-owned Application review with explicit hiring transitions and snapshot-only resume access.

Deferred: saved jobs, resume parsing, email, dashboards, company teams, caching, queues, analytics, payments, advanced Atlas Search capabilities, and all other product features. See [the architecture document](docs/architecture/architecture.md) for operational conventions and scale-up seams.
