# Architecture

## Current architecture

```text
React Web → Express API (/api/v1) → MongoDB
```

This remains a **modular monolith**: React owns client rendering; Express owns HTTP boundaries, security, validation, and future modules; MongoDB is accessed only through Mongoose in the API. `@job-board/contracts` contains small public response contracts, never persistence types.

## API and operational lifecycle

`app.ts` creates Express independently for integration tests. `server.ts` validates configuration, connects MongoDB, configures HTTP timeouts, then begins listening. Startup fails safely if MongoDB is unavailable; a process is never declared ready before its required dependency connects.

Liveness is process-only. Readiness reflects the Mongoose connection state and returns only a safe MongoDB availability indicator. `SIGINT`, `SIGTERM`, uncaught exceptions, and unhandled rejections begin one bounded shutdown: stop accepting requests, close HTTP connections, disconnect MongoDB, then exit with an appropriate status.

Every request receives a validated or generated `X-Request-Id`, which is returned in the response and included in structured Pino logs. Controlled errors follow `{ error: { code, message, requestId, details? } }`; production never returns raw exception details.

## Input and database conventions

Request input follows: **Zod validation → explicit application-owned filter/query construction → Mongoose**. Client objects are never merged into filters or configuration. Future sort fields must be allowlisted; pagination uses bounded `page`/`limit` values (defaults `1`/`20`, maximum `100`). Selected high-scale endpoints may later use cursors.

Future Mongoose schemas should use ObjectIds for references, timestamps, strict schemas, explicit collection names, appropriate indexes and unique constraints, bounded arrays, and database-level validation alongside API validation. Use `lean()` and projections for appropriate read paths. Do not store secrets in documents; use immutable fields and soft deletes only when a real business requirement justifies them. No base model is imposed.

Automated database tests must use `NODE_ENV=test` and a database name ending in `_test`; this is a hard gate before destructive test cleanup. Current tests use dependency seams for HTTP behavior and technical primitives. MongoDB-dependent integration tests should run against the isolated Compose MongoDB service or an explicitly configured `_test` database, never a shared environment.

## Security and deployment defaults

Configuration is validated once and does not expose values in validation errors. CORS permits the configured web origin only; credentials are disabled. Helmet defaults, 100 KB configurable body limits, redacted Pino fields, and conservative HTTP request/header/keep-alive timeouts are used. Trust proxy remains disabled because deployment topology has not been defined. A global rate limiter is deferred for the same reason: correct client-IP semantics must be specified before enforcement.

Docker Compose provides web, API, and an internal-only MongoDB with a persistent development volume and health checks. Production runtime stages use non-root users and omit development dependencies from the API runtime. No secrets or `.env` files are baked into images.

## Authentication foundation

`User` is an account-identity model only, with normalized unique email, Argon2id password hash, role (`APPLICANT` or `EMPLOYER`), `ACTIVE`/`DISABLED` status, and timestamps. No profile data is stored there. Passwords must be 12–128 characters and are never trimmed, normalized, logged, or serialized. Argon2id uses 19 MiB memory, time cost 2, and parallelism 1: a practical baseline for interactive authentication that can be revisited with production capacity data.

Access tokens are HS256 JWTs with only subject and role claims, explicit issuer/audience validation, and a 10-minute lifetime. Protected routes load the current User record, so disabled accounts are rejected even before an existing access token expires. The stored role, not a claim or client value, remains authoritative for authorization.

Refresh sessions are persisted separately and retain only a SHA-256 digest of a 48-byte opaque random credential. They expire after seven days and MongoDB's TTL index cleans expired records; application logic rejects expiry independently. Refresh rotates one session document atomically. Reuse of the immediately previous credential revokes that session, bounding concurrent-refresh/replay risk. Logout revokes the active session. At most five active sessions are retained per account; the oldest are revoked when issuing another.

Refresh credentials travel in a host-only, HttpOnly, `SameSite=Lax` cookie scoped to `/api/v1/auth`; `Secure` is enabled in production. Local frontend/API ports are same-site under the current localhost topology. `SameSite=Lax` prevents the cookie from accompanying cross-site POSTs; CORS is explicitly origin-restricted but is not treated as a CSRF defense. A future cross-site deployment requires a dedicated CSRF design.

Authentication routes use an in-memory IP rate limit (20 requests per 15 minutes) with safe default `trust proxy` disabled. This is appropriate for one API instance only; distributed enforcement is deferred until a shared rate-limit store is justified. Production disables Mongoose `autoIndex`; index rollout then requires an explicit operational process. Development/test retain model-index initialization.

## Profile and company foundation

Authentication identity remains separate from business data. `ApplicantProfile` and `EmployerProfile` are one-to-zero-or-one records owned by their matching User; self routes are always scoped to the authenticated principal. `Company` is separately owned by one Employer and has both a unique owner constraint and a server-generated, stable unique slug. Public Company responses intentionally exclude ownership and employer personal data.

Applicant skills, experience, education, and text fields are bounded. Resume data, applications, and saved jobs are not embedded in profiles. Companies do not contain reverse job arrays; a future Job will reference Company by ID. The one-employer/one-company rule is an intentional initial simplification; future multi-recruiter work can introduce CompanyMembership without changing Company identity.

## Job management foundation

`Job` is a separate, strict MongoDB collection rather than an unbounded `Company.jobs` array. Each Job references `companyId` and `createdBy`, both set from the authenticated Employer and their owned Company on the server. The Job schema includes bounded plain-text description, requirements and skills; structured location; controlled work-mode/employment-type values; optional structured salary; status; optional application deadline; and lifecycle timestamps. It has a globally unique stable slug plus a compound `{ companyId, status, createdAt }` index for bounded Employer management queries.

The explicit lifecycle is `DRAFT → PUBLISHED → CLOSED → ARCHIVED`, with `DRAFT → ARCHIVED` supported for unused drafts. Reopening and deletion are intentionally absent. Drafts and Published Jobs can receive content corrections; Closed and Archived Jobs are immutable. Status changes are dedicated actions that condition their database update on the expected current state, avoiding a read-then-blind-write race. Publishing assigns `publishedAt`; closing assigns `closedAt`; archiving assigns `archivedAt`. A deadline is checked before publication and public detail reads treat an expired published Job as unavailable, but reads never silently mutate status or auto-close a Job.

The public Job route accepts only a slug and returns only Published Jobs. Its serializer excludes `createdBy`, Company ownership, and Company timestamps. Salary values are included only when `salary.visible` is true. Public Job listing/search/filtering and Applications are deferred to later phases; there is no search index, application array, queue, or notification side effect.

## Deferred seams

Cloudinary/S3/R2 storage, email verification/password reset delivery, OAuth, MFA, MongoDB Atlas/Search, Redis/BullMQ, caching, horizontal API replicas, CDN, and observability can be introduced behind future module boundaries. Full OpenAPI generation is deferred until business routes provide enough surface area. Persistent business schemas will require an explicit migration strategy. No distributed infrastructure is needed today.
