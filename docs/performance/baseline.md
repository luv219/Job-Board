# Phase 17 local performance baseline

This is a reproducible **local development baseline**, not a production capacity claim or an SLA. It was measured on 2026-08-30 with the current non-root API production image, MongoDB 8.2 in a disposable local container, Node 24.20.0, and an Intel i7-1165G7 host (4 cores / 8 logical processors). Docker had no explicit CPU or memory limits.

## Safety and repeatability

The maintained tool is [autocannon](https://github.com/mcollina/autocannon), invoked by root npm scripts. It does not use a Production database or endpoint.

- `npm run perf:seed` requires `NODE_ENV=development` or `test`, a **local** MongoDB host, a database ending in `_perf`, and `PERF_SEED_CONFIRM=synthetic` before it drops and replaces the dataset.
- `PERF_TARGET` defaults to `http://127.0.0.1:3000`; remote targets require the intentionally named `PERF_ALLOW_NONLOCAL_TARGET=I_UNDERSTAND_THIS_IS_NON_PRODUCTION` override. Production-like host names, credentials, query strings, and fragments are refused.
- Authenticated runs require a caller-supplied `PERF_ACCESS_TOKEN`; the tooling never reports the token. The seed accounts are synthetic `@example.test` accounts only.
- `npm run perf:write` exercises a pre-existing idempotent saved-job POST. It does not create a new bookmark; no cleanup is needed.

The safety tests are in `apps/api/test/performance-safety.test.ts` and cover local database acceptance, Production/remote/ambiguous database refusal, malformed/Production target refusal, and seed confirmation.

## Dataset and runtime

The measured database was `job_board_perf` and contained:

| Collection data | Count |
| --- | ---: |
| Users | 300 |
| Companies | 100 |
| Published Jobs | 5,000 |
| Applications | 4,000 |
| Saved Jobs | 2,000 |

All records, profile data, resumes, emails, and credentials were synthetic. The API listened only on `127.0.0.1:3100`; MongoDB only on `127.0.0.1:27018`. The public profile deliberately stayed beneath the shared in-memory public-search limit (120 requests / 15 minutes per IP), so rate limiting remained part of the measurement rather than being bypassed.

## Baseline results

Each row is a ten-second autocannon scenario against the production API image and local `_perf` database. There were no client errors, timeouts, or non-2xx responses.

| Scenario | Rate | Requests | Average | p50 | p99 | Max |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Public newest listing | 2 rps | 20 | 22.85 ms | 19 ms | 83 ms | 90 ms |
| Public relevance search | 2 rps | 20 | 21.71 ms | 21 ms | 63 ms | 68 ms |
| Public filtered listing | 2 rps | 20 | 31.05 ms | 30 ms | 74 ms | 81 ms |
| Public autocomplete | 1 rps | 10 | 17.08 ms | 17 ms | 41 ms | 44 ms |
| Public Job detail | 2 rps | 20 | 7.16 ms | 7 ms | 19 ms | 20 ms |
| Applicant dashboard | 4 rps | 60 | 36.90 ms | 34 ms | 124 ms | 143 ms |
| Applicant application history | 4 rps | 60 | 19.30 ms | 18 ms | 48 ms | 54 ms |
| Applicant saved jobs | 4 rps | 60 | 108.87 ms | 64 ms | 397 ms | 412 ms |
| Employer application list | 4 rps | 40 | 37.34 ms | 31 ms | 122 ms | 133 ms |
| Existing idempotent save POST | 1 rps | 10 | 12.65 ms | 12 ms | 36 ms | 38 ms |

At rest after the run, the API used 69.38 MiB and MongoDB 245.8 MiB according to `docker stats`. These snapshots are diagnostic context, not peak-memory measurements.

## Query and index review

`explain('executionStats')` was run against the same local data.

| Query shape | Index / plan | Keys | Documents | Time | Decision |
| --- | --- | ---: | ---: | ---: | --- |
| Default public listing | `status_1_publishedAt_-1` IXSCAN | 20 | 20 | 2 ms | Keep |
| Text relevance search | `job_public_text` TEXT_OR + SORT | 2,500 | 5,000 | 19 ms | Expected candidate work; no new index yet |
| Saved-job list | `applicantUserId_1_jobId_1` IXSCAN + in-memory sort | 10 | 10 | 2 ms | Keep; the synthetic user has only 10 bookmarks |
| Applicant application list | `applicantUserId_1_status_1_appliedAt_-1` IXSCAN + in-memory sort | 21 | 20 | 2 ms | Keep |

The saved-job p99 was higher than the other reads, but its database plan examined only ten documents. One local ten-second sample is insufficient evidence for an index that would add write cost. Re-measure with materially larger per-user bookmark counts before considering a `{ applicantUserId, createdAt, _id }` compound index.

## MongoDB and runtime configuration

The API currently specifies a 10-second MongoDB server-selection timeout and otherwise keeps the installed driver's defaults: maximum pool size 100, minimum pool size 0, no idle timeout, and no wait-queue timeout. No pool setting was changed because this low-rate baseline showed neither queueing nor connection pressure. Server request/header/keep-alive timeouts remain 30 s / 35 s / 5 s.

No caching, Redis, queue, replica, sharding, Atlas Search change, or new index was introduced. The measured single-process output does not establish a safe production concurrency limit. Production capacity requires a representative hosted topology, independently observed client traffic, a defined SLO, and sustained multi-minute testing.

## Commands

```powershell
$env:NODE_ENV='development'
$env:MONGODB_URI='mongodb://127.0.0.1:27018/job_board_perf'
$env:PERF_SEED_CONFIRM='synthetic'
npm run perf:seed

$env:PERF_TARGET='http://127.0.0.1:3000'
npm run perf:smoke
```

`npm run perf:auth`, `npm run perf:employer`, and `npm run perf:write` require the documented synthetic-account token and identifiers. They are deliberately manual and are not part of ordinary CI. Select a single named scenario with `PERF_SCENARIO` when capturing a compact result.
