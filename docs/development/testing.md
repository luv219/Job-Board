# Testing strategy

`npm run test` runs API and web Vitest suites. API tests use Supertest for HTTP behavior; web tests use Testing Library. `npm run test:coverage` reports V8 coverage without enforcing an arbitrary threshold.

MongoDB integration suites are intentionally gated. Set `RUN_MONGODB_TESTS=1` and point `MONGODB_URI` to a local database whose name ends in `_test`; the API refuses destructive cleanup in any other environment. Tests inject fake email and resume-storage providers, so normal CI does not use SMTP, Cloudinary, Atlas Search, or Production resources.

The test suite covers auth/session handling, validation/security boundaries, Job search/lifecycle, private resume operations, duplicate Application and SavedJob concurrency cases, Employer review authorization, notifications, and dashboard behavior. Browser E2E is not configured; no E2E claim is made.

The GitHub Actions workflow runs `npm ci`, lint, typecheck, tests, coverage, build, and production-image builds on pull requests and `main`. It uses an isolated MongoDB service and a `_test` database, has read-only repository permissions, and has no deploy job or Production secrets.

Performance tooling is separate from ordinary CI. Its seed path requires a local `_perf` database and an explicit confirmation; see [performance baseline](../performance/baseline.md).
