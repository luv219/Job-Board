# Job Board

A production-oriented TypeScript MERN modular monolith for a niche job board. Phase 11 adds the responsive React client for the existing Applicant, Employer, public job-discovery, account-recovery, and application-management APIs.

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

Set `MONGODB_URI` in `.env` to a local MongoDB instance. `API_HOST`, `API_PORT`, `WEB_ORIGIN`, `LOG_LEVEL`, and `REQUEST_BODY_LIMIT` are validated at startup. Development defaults to a no-network console email provider; production requires `EMAIL_PROVIDER=smtp`, `EMAIL_FROM`, and valid SMTP settings, as well as Cloudinary credentials for private resume storage. The example is safe and contains no real secret.

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

## Production release foundation

The repository provides separate non-root production images for the API and web client. They use pinned runtime base-image digests and deterministic `npm ci` stages, exclude every `.env*` file from the Docker context, and carry OCI title/version/revision/source labels. The web production build requires the public `VITE_API_BASE_URL` build argument; API secrets are supplied only at runtime.

No cloud provider or Production deployment workflow is configured, so no deployment is performed from CI. Pull requests and `main` run read-only quality and production-image build gates. Use full commit-SHA image tags as the release and rollback identity—never `latest` alone. See the [deployment guide](docs/operations/deployment.md) and [release checklist](docs/operations/release-checklist.md) before wiring an authorized provider.

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Run web and API development servers together |
| `npm run dev:web` / `npm run dev:api` | Run one application |
| `npm run build` | Build every workspace |
| `npm run lint` | Lint every workspace |
| `npm run typecheck` | Strict TypeScript verification |
| `npm run test` | Run API contract tests |
| `npm run test:api` / `npm run test:web` | Run one workspace's focused suite |
| `npm run test:coverage` | Generate informational Vitest V8 coverage reports |

## Testing

Unit/API-boundary tests run without external services. MongoDB integration tests are deliberately skipped unless `RUN_MONGODB_TESTS=1` is set and the URI names a database ending in `_test`; the guard rejects non-test environments before destructive cleanup. Integration suites use fake storage and email providers, and standard CI does not require Cloudinary, SMTP, Atlas Search, or external internet access.

With Compose MongoDB running, PowerShell users can run the full API integration suite from the API container:

```powershell
docker compose exec -T -e RUN_MONGODB_TESTS=1 -e MONGODB_URI=mongodb://mongodb:27017/job_board_phase14_test api npm run test -w @job-board/api
```

Browser E2E is intentionally deferred until a dedicated isolated web/API test runtime can inject the existing fake storage provider without introducing test-only production endpoints. Coverage is informational and intentionally has no arbitrary threshold.

CI uses an isolated disposable MongoDB service and a database name ending in `_test` for integration tests. It never receives Production MongoDB, SMTP, storage, or Atlas Search credentials.

## Health endpoints

- `GET /api/v1/health/live` — reports whether the API process is running; never depends on MongoDB.
- `GET /api/v1/health/ready` — returns `200` with MongoDB status when connected, otherwise `503` with a safe unavailable status.

All future API routes use `/api/v1`. Controlled errors include a stable code, a safe message, and `X-Request-Id` correlation value.

## Operations and diagnostics

The API emits structured JSON logs with a returned `X-Request-ID`, safe lifecycle events, request duration, normalized route, status, and authenticated principal ID only where available. Request and response bodies, tokens, cookies, signed URLs, and provider credentials are not logged. Requests exceeding `SLOW_REQUEST_THRESHOLD_MS` (default `1000`) receive a `slow_http_request` warning.

`GET /metrics` exposes Prometheus-compatible process, HTTP, and bounded operational counters. Treat it as an internal/infrastructure-protected endpoint; the application does not add a Prometheus server, Grafana, Sentry, OpenTelemetry, or product analytics. HTTP labels use route templates and status classes, never raw URLs, IDs, emails, IPs, request IDs, or search terms. Deployment metadata comes from safe `APP_VERSION`/revision environment values and never invokes Git at runtime.

See [the operations runbook](docs/operations/runbook.md) for health semantics, database/email/storage/search troubleshooting, and startup/shutdown guidance.

## Authentication API

| Method | Route | Purpose |
| --- | --- | --- |
| `POST` | `/api/v1/auth/register` | Register and authenticate an Applicant or Employer account |
| `POST` | `/api/v1/auth/login` | Authenticate using email/password |
| `POST` | `/api/v1/auth/refresh` | Rotate the HttpOnly refresh credential and obtain an access token |
| `POST` | `/api/v1/auth/logout` | Revoke the active refresh session and clear its cookie |
| `GET` | `/api/v1/auth/me` | Retrieve the current account using a bearer access token |
| `POST` | `/api/v1/auth/email-verification/request` | Send a replacement verification link for the authenticated account |
| `POST` | `/api/v1/auth/email-verification/confirm` | Consume a verification token |
| `POST` | `/api/v1/auth/password-reset/request` | Request a password reset with an enumeration-safe response |
| `POST` | `/api/v1/auth/password-reset/confirm` | Consume a reset token and revoke all refresh sessions |

The access token is returned in the response and is intended for short-lived in-memory client use. The opaque refresh credential is sent only in an HttpOnly, same-site cookie. Registration remains usable while `emailVerified=false`; it sends a best-effort verification email and verification can be resent by the authenticated account. Verification links expire after 24 hours; reset links expire after 30 minutes. Both use a high-entropy token stored only as a SHA-256 digest, are purpose-isolated, single-use, and rotate prior active tokens. Password reset preserves account identity/role/status and revokes all refresh sessions.

## Transactional email

Email delivery is behind a small provider boundary. SMTP/Nodemailer is the single production provider; development uses a console provider and tests inject an in-memory fake, so neither Docker nor CI needs mail credentials. Templates are centralized with HTML escaping and plain-text alternatives. Links always use the validated `WEB_ORIGIN`, never a request Host header.

Successful Application submission sends best-effort confirmation to the Applicant and a new-Application notice to the owning Employer. A successful Employer status transition sends the Applicant a status email. No resume file, provider URL, signed URL, raw token, email body, or Employer contact address is exposed through API responses or logs. Business writes complete before notification is attempted, and a delivery failure is logged safely without rolling back the Application or status change. Security email delivery failures revoke the just-issued token; password-reset requests retain their generic response to prevent enumeration.

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

## Applicant Saved Jobs and dashboard API

Saved Jobs are private Applicant bookmarks held in a separate `SavedJob` collection. The database uniquely enforces one bookmark per `(applicantUserId, jobId)`. Saving is idempotent: an active public Job returns `201` on its first save and `200` when it is already saved. Unsaving is also idempotent and returns `204`, without changing the Job or any Application.

| Method | Route | Purpose |
| --- | --- | --- |
| `POST` | `/api/v1/applicant/saved-jobs/:jobId` | Save an active public Job |
| `DELETE` | `/api/v1/applicant/saved-jobs/:jobId` | Remove the authenticated Applicant’s bookmark |
| `GET` | `/api/v1/applicant/saved-jobs` | List personal bookmarks (`page`, `limit`, `sort`) |
| `GET` | `/api/v1/applicant/dashboard` | Retrieve a concise, private Applicant dashboard summary |

New saves require the same Published/non-expired eligibility as public Jobs. Existing Saved Jobs remain after a Job closes, archives, or expires; list and dashboard data mark them inactive while retaining only safe Job and Company fields. Hidden salary stays hidden. Saving and applying are independent actions.

The dashboard is a bounded derived read model, not a collection. It reads the Applicant profile/resume metadata, current Application statuses and recent Applications, and SavedJob counts/recent bookmarks from their authoritative collections. It never creates a resume URL or persists dashboard counters. Full frontend dashboard UI, Job alerts, recommendations, and analytics are deferred.

## Repository structure

```text
apps/             Deployable web and API applications
packages/         Shared public contracts
docs/architecture/ Architecture decisions and future seams
docker/           Application Dockerfiles
.github/workflows/ CI quality gate
```

## Phase 12 search and discovery

`GET /api/v1/jobs` now returns the existing paginated Job cards plus `facets.workMode` and `facets.employmentType`; facet counts use the same eligible, filtered search universe. `GET /api/v1/jobs/autocomplete?q=...` is public, requires at least two characters, and returns at most eight eligible Job-title or skill suggestions.

Search uses validated `JOB_SEARCH_MODE`. `basic` (the Docker/local default) uses the existing weighted MongoDB text index with deterministic escaped filters. `atlas` uses the Atlas Search query builder, with title/skills/requirements/description boosts and conservative fuzzy matching. Atlas index creation is a manual deployment step using [the checked-in mapping](docs/architecture/atlas-job-search-index.json); the application never attempts to create or alter an Atlas index. Production must explicitly choose a mode and must set `ATLAS_SEARCH_INDEX` when choosing `atlas`.

## Current status and intentionally deferred work

Implemented: workspace foundation, API lifecycle separation, strict configuration, MongoDB lifecycle handling, standardized health/error responses, request validation and query-safety primitives, security middleware, request correlation, bounded shutdown/timeouts, Docker health checks, isolated test-database guardrails, password authentication, rotating refresh sessions, RBAC primitives, private profiles/companies, Job discovery, private resume management, Applicant Job submission/history/withdrawal, Employer-owned Application review, Saved Jobs/dashboard data, SMTP-backed transactional email, verification/reset delivery, best-effort Application notifications, role-based frontend, Atlas/basic search selection, security hardening, test coverage foundation, and Phase 15 structured operational logs, safe version metadata, Prometheus-compatible bounded metrics, MongoDB readiness ping, and an operations runbook.

Deferred: saved-search alerts, resume parsing, company teams, caching, queues/outbox workers, recommendations, business analytics, SMS/push, payments, Atlas synonym/highlight capabilities, external metrics collection/dashboards, error reporting, distributed tracing, and all other product features. See [the architecture document](docs/architecture/architecture.md) for operational conventions and scale-up seams.

## Frontend development

The Vite client uses React Router for public, Applicant, Employer, and account-recovery routes. TanStack Query owns API data and React context holds only the in-memory short-lived access token and authenticated user. Refresh credentials remain in the API-managed HttpOnly cookie; no token, reset link, or signed resume URL is stored in browser storage.

Set `VITE_API_BASE_URL` to the API origin (for example `http://localhost:3000`). Start both services with `npm run dev`, or use `docker compose up`. The web workspace runs focused component/API-client tests with `npm run test -w @job-board/web`; root `npm run test` runs every workspace test.

Implemented frontend routes include public home/jobs/company pages; login/register/verification/reset flows; Applicant dashboard/profile/resume/saved-jobs/application views; and Employer profile/company/job/application management. Search filters and pagination are kept in the public URL. The client provides responsive navigation, semantic forms, loading/empty/error states, route guards, and role-aware navigation.
