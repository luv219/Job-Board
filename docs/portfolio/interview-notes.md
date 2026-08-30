# Interview notes

- **Why a modular monolith?** One product and transactional data model are easier to reason about, test, and operate. Feature modules and provider boundaries keep future extraction possible without paying distributed-system cost now.
- **Why access plus rotating refresh?** The access token is short-lived and the persisted refresh session supplies logout, expiry, reuse detection, and server-side revocation.
- **Why a separate Application collection?** It enforces one Application per Applicant/Job, supports history and Employer filtering, and avoids unbounded embedded arrays.
- **Why immutable snapshots?** A submitted Application remains tied to the resume submitted at that time even when the Applicant replaces their current resume.
- **Why basic and Atlas search modes?** Local/CI can run deterministic MongoDB search without an external dependency; Atlas is explicitly configured when its capabilities are needed.
- **Why no Redis yet?** Phase 17 local evidence did not show a cache or distributed worker need. The trade-off is per-instance rate limits, which must be redesigned before horizontal replicas.
- **How are races handled?** Unique indexes reserve duplicate-sensitive records; lifecycle updates predicate on expected state; tests exercise concurrent duplicate actions.
- **How does it scale?** First establish SLOs and representative load. Then add stateless API replicas with a connection/rate-limit plan; consider targeted indexes, caching, Atlas tuning, or outbox workers only for measured bottlenecks.
