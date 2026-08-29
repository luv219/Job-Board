# Architecture

## Current architecture

```text
React Web
    ↓ HTTP/JSON
Express API
    ↓ Mongoose
MongoDB
```

The React application owns client rendering and will later own navigation and user interaction. The Express application owns HTTP boundaries, validation, security policy, operational endpoints, and future product modules. MongoDB is the operational data store, accessed only through the API with Mongoose. `@job-board/contracts` holds narrowly scoped public request/response contracts; it does not expose persistence types.

Configuration is loaded once at API startup through a Zod schema. Pino provides structured, redacted operational logs with request IDs. Docker Compose provides a local web/API/MongoDB environment; MongoDB is network-internal and persists through a named volume.

## Architectural decision: modular monolith

The project intentionally starts as a modular monolith. One web application, one API deployment, and one database keep development and operations comprehensible for a single developer while retaining clear module boundaries. Microservices are deferred because authentication, jobs, applications, search, and notifications do not yet have independently proven scale or ownership needs.

## Future scale-up seams

- **Resume storage:** introduce a `FileStorageProvider` at the future resume module boundary, with implementations such as `CloudinaryStorageProvider`, `S3StorageProvider`, or `R2StorageProvider`. No interface is added until a caller exists.
- **Email:** the future notification module should depend on an email-provider boundary for account and application messages. A production provider and asynchronous workers are intentionally not selected yet.
- **Search:** initial job search should use MongoDB indexes and query composition behind a job-search module. MongoDB Atlas Search can later replace the internals without changing HTTP routes.
- **Scale:** MongoDB Atlas, Redis-backed caching, BullMQ workers, horizontal stateless API replicas, CDN delivery, and richer observability are compatible future additions. They require demonstrated operational need before adoption.

Redis, BullMQ, dedicated search, queues, email infrastructure, and all distributed systems are intentionally absent from Phase 0.
