# Operations runbook

## Signal model

`GET /api/v1/health/live` answers whether the API process can serve HTTP. It intentionally does not depend on MongoDB, email, resume storage, or Atlas Search. `GET /api/v1/health/ready` is the traffic-routing check: it requires a connected MongoDB instance and a short admin ping. A `503` readiness response is safe and contains only the database state category.

`GET /metrics` exposes Prometheus text metrics for an internal monitoring network or an infrastructure-protected path. Do not expose it directly on the public internet without an upstream access policy. It has no normal API rate limit because a trusted scraper polls it regularly.

## Database

Symptoms: readiness returns `503`, or logs include `database_disconnected`, `database_error`, or `database_connection_failed`.

Check `/api/v1/health/live` and `/api/v1/health/ready`, then verify the deployment's `MONGODB_URI` is present and points to the intended environment without printing it. Inspect the database service/network and platform logs. Restart the API only after confirming the database is reachable; liveness staying healthy during a database outage is expected.

## Email

Symptoms: `security_email_failed` or `business_email_failed` logs and increased `job_board_email_operations_total{result="failure"}`.

Verify SMTP configuration and provider status without copying credentials into logs or tickets. Verification/reset delivery is security-sensitive and its token issuance is rolled back on delivery failure. Application-notification delivery is best effort after its database state is committed, so retry/reconciliation is a product decision rather than a rollback action.

## Resume storage

Symptoms: `resume_storage_failed`, `application_resume_access_failed`, or a rising `job_board_resume_operations_total{result="failure"}`.

Check validated storage configuration and provider availability. Resume upload, application snapshot, and signed-access operations can fail independently while general API readiness remains healthy. Cleanup warnings can indicate a private orphan; do not log asset identifiers, filenames, signed URLs, or provider secrets while investigating.

## Search

Docker/local uses `JOB_SEARCH_MODE=basic`. Atlas mode is configured explicitly in production. A failure in Atlas search affects its search operation rather than global readiness; inspect the structured request error and `job_board_search_requests_total`. Do not use an Atlas `$search` call as a health probe. If Atlas must be restored, verify its configured index outside the public API. There is no silent mode fallback after an Atlas query failure.

## Authentication and rate limits

Use request IDs from API response headers to locate the correlated structured completion/error log. Investigate elevated `4xx` rates, authentication completion logs, and Phase 13 rate-limit responses without recording password, refresh-token, reset-token, verification-token, email, or IP values. A rate-limit spike may be abuse or a client retry defect; preserve the existing limiter boundaries while diagnosing it.

## Startup, shutdown, and deploys

Successful startup writes `api_started` with safe version, revision, environment, Node version, port, and search mode metadata. Invalid configuration fails before serving traffic and reports field names only. Initial MongoDB connection is required before this API starts.

On `SIGTERM` or `SIGINT`, logs show `graceful_shutdown_started`, then either `graceful_shutdown_completed` or a bounded `graceful_shutdown_timed_out`/`graceful_shutdown_failed`. The API stops accepting HTTP connections, disconnects MongoDB, and allows up to 10 seconds before forced connection closure. Use readiness for traffic removal and liveness only for process restart decisions.

## Suggested external panels and alerts

Monitor request rate, 5xx rate, p95/p99 HTTP latency, process memory/event-loop metrics, readiness, database disconnects, email/storage/search failures, and rate-limit events through structured logs. Alert on sustained 5xx growth, repeated readiness failure, database disconnects, high latency, provider-failure spikes, repeated `429` responses, or sustained memory pressure. Thresholds are deployment-specific and should be calibrated from observed traffic; this repository does not include Grafana, a Prometheus server, PagerDuty, or tracing infrastructure.
