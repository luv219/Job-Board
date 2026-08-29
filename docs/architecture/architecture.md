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

Configuration is validated once and does not expose values in validation errors. CORS permits only the configured web origin and allows credentials for the refresh-cookie flow. Helmet defaults, 100 KB configurable body limits, redacted Pino fields, and conservative HTTP request/header/keep-alive timeouts are used. Trust proxy remains disabled because deployment topology has not been defined. A global rate limiter is deferred for the same reason: correct client-IP semantics must be specified before enforcement.

Docker Compose provides web, API, and an internal-only MongoDB with a persistent development volume and health checks. Production runtime stages use non-root users and omit development dependencies from the API runtime. No secrets or `.env` files are baked into images.

## Authentication foundation

`User` is an account-identity model only, with normalized unique email, Argon2id password hash, role (`APPLICANT` or `EMPLOYER`), `ACTIVE`/`DISABLED` status, and timestamps. No profile data is stored there. Passwords must be 12–128 characters and are never trimmed, normalized, logged, or serialized. Argon2id uses 19 MiB memory, time cost 2, and parallelism 1: a practical baseline for interactive authentication that can be revisited with production capacity data.

Access tokens are HS256 JWTs with only subject and role claims, explicit issuer/audience validation, and a 10-minute lifetime. Protected routes load the current User record, so disabled accounts are rejected even before an existing access token expires. The stored role, not a claim or client value, remains authoritative for authorization.

Refresh sessions are persisted separately and retain only a SHA-256 digest of a 48-byte opaque random credential. They expire after seven days and MongoDB's TTL index cleans expired records; application logic rejects expiry independently. Refresh rotates one session document atomically. Reuse of the immediately previous credential revokes that session, bounding concurrent-refresh/replay risk. Logout revokes the active session. At most five active sessions are retained per account; the oldest are revoked when issuing another.

Refresh credentials travel in a host-only, HttpOnly, `SameSite=Lax` cookie scoped to `/api/v1/auth`; `Secure` is enabled in production. Local frontend/API ports are same-site under the current localhost topology. `SameSite=Lax` prevents the cookie from accompanying cross-site POSTs; CORS is explicitly origin-restricted but is not treated as a CSRF defense. A future cross-site deployment requires a dedicated CSRF design.

Authentication routes use an in-memory IP rate limit (20 requests per 15 minutes) with safe default `trust proxy` disabled. This is appropriate for one API instance only; distributed enforcement is deferred until a shared rate-limit store is justified. Production disables Mongoose `autoIndex`; index rollout then requires an explicit operational process. Development/test retain model-index initialization.

## Profile and company foundation

Authentication identity remains separate from business data. `ApplicantProfile` and `EmployerProfile` are one-to-zero-or-one records owned by their matching User; self routes are always scoped to the authenticated principal. `Company` is separately owned by one Employer and has both a unique owner constraint and a server-generated, stable unique slug. Public Company responses intentionally exclude ownership and employer personal data.

Applicant skills, experience, education, and text fields are bounded. The one-current-resume metadata record is deliberately embedded in `ApplicantProfile`: provider name, opaque asset ID, sanitized original filename, allowed MIME type, byte size, and upload time. It does not contain raw bytes/base64, a permanent URL, a signed URL, or any provider secret. Applications and saved jobs remain deferred. Companies do not contain reverse job arrays; a future Job will reference Company by ID. The one-employer/one-company rule is an intentional initial simplification; future multi-recruiter work can introduce CompanyMembership without changing Company identity.

## Job management foundation

`Job` is a separate, strict MongoDB collection rather than an unbounded `Company.jobs` array. Each Job references `companyId` and `createdBy`, both set from the authenticated Employer and their owned Company on the server. The Job schema includes bounded plain-text description, requirements and skills; structured location; controlled work-mode/employment-type values; optional structured salary; status; optional application deadline; and lifecycle timestamps. It has a globally unique stable slug plus a compound `{ companyId, status, createdAt }` index for bounded Employer management queries.

The explicit lifecycle is `DRAFT → PUBLISHED → CLOSED → ARCHIVED`, with `DRAFT → ARCHIVED` supported for unused drafts. Reopening and deletion are intentionally absent. Drafts and Published Jobs can receive content corrections; Closed and Archived Jobs are immutable. Status changes are dedicated actions that condition their database update on the expected current state, avoiding a read-then-blind-write race. Publishing assigns `publishedAt`; closing assigns `closedAt`; archiving assigns `archivedAt`. A deadline is checked before publication and public detail reads treat an expired published Job as unavailable, but reads never silently mutate status or auto-close a Job.

The public Job-detail route accepts only a slug and returns only Published Jobs. Its serializer excludes `createdBy`, Company ownership, and Company timestamps. Salary values are included only when `salary.visible` is true. Applications remain deferred; there is no application array, queue, or notification side effect.

## Public Job discovery

Public Job detail and `GET /api/v1/jobs` share one active-Job rule: `PUBLISHED` status and no deadline, or a deadline at/after the single request timestamp. Reads never update a Job. The listing accepts a deliberately small, strict query surface: keyword (`q`), structured location, work mode, employment type, comma-separated skills, public salary range with matching currency and period, Company slug, posting window, sorting, and bounded page/limit pagination. Unknown or malformed parameters return the standard validation error.

Keyword search uses MongoDB's single deliberate text index over title, skills, requirements, and description, with title weighted most heavily. It provides MongoDB text-token matching and score ordering only; it is not fuzzy search, autocomplete, synonym expansion, highlighting, or semantic search. Exact case-insensitive location and skills matching uses escaped anchored regular expressions, never client-supplied patterns. Skills use ANY semantics within the requested list; filter categories compose with AND.

Public salary filters require both `currency` and `salaryPeriod` and select only `salary.visible=true` records before applying overlap comparisons. Hidden or absent salary never influences filtering, sorting, or output. The supported sorts are newest, oldest, and text relevance (only with `q`); keyword searches default to relevance, while ordinary browsing defaults to newest. Salary sorting and industry filtering are deferred because the initial salary privacy/period semantics and free-form industry data do not justify them.

Results use `skip`/`limit` (default 20, maximum 100) and one consistent count filter. Companies are loaded in one batched public-field query after the Job page, avoiding N+1 lookups. The index set adds `{ status, publishedAt }` for default active browsing and `{ companyId, status, publishedAt }` for Company-scoped public browsing, alongside the existing ownership index and one weighted text index. No deadline-specific index is added yet: it would add write cost without an established query-plan need. Deep offsets, caching, cursor pagination, Atlas Search, and read replicas remain future measured scale-up seams.

## Private resume storage foundation

Resume storage is a narrow API-only boundary: `ResumeStorageProvider` has only upload, deletion, and time-limited access-URL operations. `CloudinaryResumeStorageProvider` is the production implementation, configured only from validated environment values. It uploads PDFs as `raw` Cloudinary assets with `type: private`, uses random opaque public IDs below a dedicated folder, disables filename-derived IDs/overwrites, and generates a signed private download URL only when the authenticated owning Applicant asks for access. Cloudinary response objects never leave the provider module.

The HTTP boundary accepts exactly one multipart file named `resume`, with memory buffering bounded to 5 MiB. PDF-only policy verifies the client MIME declaration, sanitizes and checks the `.pdf` filename, and detects PDF magic bytes; any mismatch is rejected. Request body limits remain in force for JSON/form bodies, while Multer has independent file, field, part, and file-name limits. The upload limiter is per authenticated Applicant (10 attempts per 15 minutes) and runs before multipart parsing. No public, employer, or arbitrary-user file route exists.

Replacement uploads a new private asset first, atomically swaps profile metadata only when the observed current asset still matches, then attempts to delete the old asset. A lost concurrent update removes the newly-uploaded candidate and reports a retryable conflict. On deletion, metadata is atomically removed first so the application will not issue further access URLs, then the provider deletion is attempted. Cleanup failures are redacted structured warnings for later reconciliation; they never expose an asset ID, URL, filename, or credential. This yields a private provider orphan in the rare cleanup-failure case rather than retaining accessible application metadata.

Cloudinary credentials are required in production; startup refuses incomplete or placeholder values. Development may intentionally omit them so non-file development can proceed, in which case resume calls return a safe storage-not-configured error. Tests inject a fake storage provider; neither it nor Cloudinary is a generic storage framework. Future `S3StorageProvider` or `R2StorageProvider` implementations can satisfy the same small contract when a concrete need exists. A future Job Application can snapshot the current metadata/version at submission time, but it must not be built into the resume module now.

## Deferred seams

S3/R2 resume storage alternatives, resume parsing/scanning, email verification/password reset delivery, OAuth, MFA, MongoDB Atlas/Search, Redis/BullMQ, caching, horizontal API replicas, CDN, and observability can be introduced behind future module boundaries. Full OpenAPI generation is deferred until business routes provide enough surface area. Persistent business schemas will require an explicit migration strategy. No distributed infrastructure is needed today.
