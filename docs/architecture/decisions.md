# Architecture decisions and trade-offs

| Decision | Why now | Trade-off and reconsideration trigger |
| --- | --- | --- |
| TypeScript MERN modular monolith | One product, one transactional data store, explicit modules. | API replicas remain possible; split services only when operational ownership and boundaries justify them. |
| Access token plus rotating refresh session | Short browser token lifetime with server-side session revocation. | Cookie topology must be designed if the web/API become cross-site. |
| Separate Profile, Company, Job, Application, SavedJob collections | Ownership and lifecycle invariants need focused records and indexes. | More application joins/batches than an embedded document design. |
| Immutable Application resume snapshot | A submitted record must not change when the current resume changes. | Storage copy/cleanup compensation is required. |
| Basic search plus optional Atlas mode | Local/CI remain deterministic without a managed service. | Atlas setup is an explicit external prerequisite. |
| No Redis, workers, or cache now | Phase 17 local evidence does not justify distributed infrastructure. | Per-instance rate limits need a shared/edge design before multiple API replicas. |
| Dockerized immutable production artifacts | Reproducible, non-root API/web runtime stages. | Provider-specific deployment remains intentionally unchosen. |
