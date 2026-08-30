# API overview

Base path: `/api/v1`. Bearer access tokens authorize private routes; refresh is cookie-based. Controlled failures use `{ "error": { "code", "message", "requestId" } }` and return `X-Request-Id`.

| Group | Access | Routes and purpose |
| --- | --- | --- |
| Health | Public infrastructure | `GET /health/live`, `GET /health/ready` |
| Metrics | Infrastructure protected externally | `GET /metrics` is mounted outside `/api/v1` |
| Authentication | Mixed | Register, login, refresh, logout, current account, verification, password reset |
| Public | Public | `GET /jobs`, `/jobs/autocomplete`, `/jobs/:slug`, `/companies/:slug` |
| Applicant | Applicant | Profile, resume metadata/access/delete, Applications, Saved Jobs, dashboard |
| Employer | Employer | Profile, Company, Job management/lifecycle, Application review/snapshot access |

Key private routes are derived from `apps/api/src/routes`.

```bash
curl 'http://localhost:3000/api/v1/jobs?q=engineer&sort=relevance&page=1&limit=20'
curl http://localhost:3000/api/v1/applicant/dashboard -H 'Authorization: Bearer <access-token>'
```

The route implementations and validation schemas are authoritative. Resume access and metrics have additional deployment/security boundaries; see [security](../operations/security.md) and [deployment](../operations/deployment.md).
