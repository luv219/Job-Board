# Capacity guidance

## Current conclusion

Phase 17 establishes a safe, reproducible local baseline only. It does **not** claim a production throughput, concurrent-user, or latency capacity. The application remains one modular-monolith API with one MongoDB deployment boundary; that is the intended current architecture.

## Observed constraints

- Public search is intentionally capped at 120 requests per 15 minutes per process/IP and autocomplete at 60 per minute. This protects the current single instance but is not a distributed limiter.
- The synthetic 5,000-Job text search examined 5,000 documents / 2,500 text-index keys for its matching term. Relevance search should be re-measured using representative terms and a larger corpus before changing search technology.
- The default MongoDB pool is ample for the measured local profile, but a production pool must be sized per API replica and MongoDB connection budget—not copied from this benchmark.
- Offset pagination is bounded to 100 results but deep offsets become increasingly expensive. Cursor pagination is a future option after evidence from real access patterns.
- The higher saved-job p99 warrants monitoring, not an immediate index. Its local plan examined only ten documents and did not indicate a collection scan.

## Scale-up triggers

| Observed evidence | Deliberate next step |
| --- | --- |
| Sustained p95/p99 breach on a known SLO | Profile the route, query plan, payload, and event-loop/GC metrics before changing code |
| Large per-user bookmark lists show a blocking sort | Benchmark and review a targeted compound SavedJob index |
| Text-search candidate scans dominate user-visible latency | Evaluate Atlas Search using the existing provider seam and a managed index rollout |
| More than one API replica is required | Design shared rate limiting / edge policy and calculate total MongoDB connections first |
| Read pressure exceeds a measured primary budget | Evaluate cache policy, invalidation, read replicas, or CDN separately; do not add all of them together |
| Email or file side effects dominate request latency | Measure the provider boundary, then consider an outbox/worker design with explicit ownership and retries |

## Operations required before a production claim

1. Define endpoint SLOs and acceptable error/timeout rates.
2. Run sustained and ramp tests from a separate load generator against a non-production environment with production-like MongoDB sizing.
3. Monitor API CPU, RSS, heap, event-loop lag, MongoDB operations/locks/connections, network, and client-side latency.
4. Record the exact dataset cardinality and distribution, API replica count, MongoDB version/tier, driver pool configuration, and rate-limit policy.
5. Change one bottleneck at a time, re-run the same profile, and retain both before/after evidence.

Redis, BullMQ, caching, sharding, read replicas, Atlas Search, and extra API services remain deferred. None is justified solely by the Phase 17 local baseline.
