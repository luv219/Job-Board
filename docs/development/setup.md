# Development setup

## Fastest local path

```powershell
Copy-Item .env.example .env
node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"
npm ci
docker compose up --build
```

Copy the generated value into `ACCESS_TOKEN_SECRET` in `.env` before starting Compose; the checked-in placeholder is intentionally rejected. Open `http://localhost:5173`. Check `http://localhost:3000/api/v1/health/live` and `/api/v1/health/ready`. Stop with `docker compose down`; this does not remove the named MongoDB volume.

## Host-run path

Start a local MongoDB matching `.env`, then run `npm ci` and `npm run dev`. Use `npm run dev:web` or `npm run dev:api` for one workspace. The API needs MongoDB before it starts.

## Environment variables

| Variable/category | Required | Purpose |
| --- | --- | --- |
| `NODE_ENV`, `API_HOST`, `API_PORT` | Core | Runtime mode and API binding. |
| `MONGODB_URI` | Always | MongoDB connection; treat as a secret in deployed environments. |
| `WEB_ORIGIN`, `VITE_API_BASE_URL` | Web | CORS/email-link origin and public browser API origin. |
| `ACCESS_TOKEN_*`, `REFRESH_TOKEN_TTL_DAYS` | Always | JWT validation and refresh lifetime; secret is required. |
| `EMAIL_*`, `SMTP_*` | Production | SMTP delivery; development defaults to console email. |
| `CLOUDINARY_*` | Production file operations | Private resume storage. |
| `JOB_SEARCH_MODE`, `ATLAS_SEARCH_INDEX` | Search | Basic by default; Atlas needs an externally provisioned index. |
| `LOG_LEVEL`, `SLOW_REQUEST_THRESHOLD_MS` | Operations | Safe logging and slow-request signal. |
| `APP_VERSION`, `APP_REVISION`, `TRUST_PROXY_HOPS` | Deployment | Revision identity and verified proxy count. |

Production validation requires HTTPS `WEB_ORIGIN`, SMTP, storage credentials, an explicit search mode, and non-local/non-test MongoDB. Never commit real URI credentials, access-token secrets, provider keys, or SMTP passwords.

`npm run test` runs workspace tests. Mongo integration tests require `RUN_MONGODB_TESTS=1` and a safe `_test` database. The local performance seed requires a local `_perf` database and explicit synthetic confirmation; see [baseline](../performance/baseline.md).
