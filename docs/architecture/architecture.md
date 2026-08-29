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

## Deferred seams

Cloudinary/S3/R2 storage, an email provider, MongoDB Atlas/Search, Redis/BullMQ, caching, horizontal API replicas, CDN, and observability can be introduced behind future module boundaries. Full OpenAPI generation is deferred until business routes provide enough surface area. Persistent business schemas will require an explicit migration strategy. No distributed infrastructure is needed today.
