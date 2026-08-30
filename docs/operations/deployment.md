# Production deployment guide

This repository prepares portable container artifacts; it does not select a cloud provider or deploy any environment. A production deployment target, its protected environment, and its secret store must be selected explicitly before deployment automation is added.

## Artifacts

Build the API and web images separately from a clean checkout. Supply the same immutable source revision to both images and publish immutable tags such as the full commit SHA (for example, `job-board-api:<sha>` and `job-board-web:<sha>`). A mutable convenience tag may be added by an operator, but it is never the sole release or rollback reference.

```bash
docker build --file docker/api.Dockerfile --target production \
  --build-arg APP_VERSION=0.1.0 \
  --build-arg APP_REVISION=<full-commit-sha> \
  --tag job-board-api:<full-commit-sha> .

docker build --file docker/web.Dockerfile --target production \
  --build-arg VITE_API_BASE_URL=https://api.example.com \
  --build-arg APP_VERSION=0.1.0 \
  --build-arg APP_REVISION=<full-commit-sha> \
  --tag job-board-web:<full-commit-sha> .
```

`VITE_API_BASE_URL` is intentionally a build-time public value. It must contain only the browser-visible API origin; never put API credentials, SMTP values, storage credentials, or database URLs in a `VITE_*` variable. The API receives its configuration only at runtime.

Both final images carry OCI title, version, revision, and source labels. The API also receives `APP_VERSION` and `APP_REVISION` image defaults. Verify a running API revision through the bounded `job_board_build_info` metric label and the `api_started` structured startup event; neither invokes Git at runtime.

## Runtime configuration and trust boundary

Inject API configuration from the chosen platform's protected runtime secret/configuration mechanism. Required categories are:

- MongoDB runtime connection (`MONGODB_URI`) and a least-privilege application database principal.
- API security settings, including `ACCESS_TOKEN_SECRET`, issuer/audience, cookie/domain/TLS topology, request limit, and the verified `TRUST_PROXY_HOPS` count.
- Public HTTPS web origin (`WEB_ORIGIN`). This project uses `WEB_ORIGIN` as its public application URL for CORS and email links; it has no separate `APP_PUBLIC_URL` variable.
- SMTP provider settings and sender identity.
- Private resume-storage provider settings.
- Explicit search mode and, only for Atlas mode, the pre-created Atlas Search index name.
- Safe logging, version, and revision metadata.

The API's Production validator requires HTTPS `WEB_ORIGIN`, SMTP, storage credentials, and an explicit search mode. Do not use the local Compose MongoDB service, console email provider, fake storage provider, test database names, or placeholder configuration in Production. The release process does not create or change database users, provider settings, DNS, TLS, storage, or Atlas Search indexes.

The web host must serve HTTPS and route direct client-side paths to `index.html`. Its origin must exactly match `WEB_ORIGIN`. Configure the API's known proxy count instead of trusting arbitrary forwarded headers. Keep `/metrics` on an internal network or behind infrastructure access controls; logs are emitted to stdout/stderr for the platform to collect.

## Deployment gate

Production deployment automation is **DEFERRED** because this repository has no configured target or environment-protection policy. The existing CI workflow runs on pull requests and `main`, has read-only repository permission, uses no production secrets, and cannot deploy.

Before an authorized provider-specific deploy job is added, require all of the following:

1. A protected Production environment with approval rules and environment-scoped secrets.
2. Deployment triggered only from an approved immutable `main` revision or protected release tag, never an untrusted pull request.
3. A deploy concurrency group for the target environment (`cancel-in-progress: false`) so two releases cannot race.
4. Deployment of images already built and identified by their immutable revision—not a rebuild from a moving branch.
5. Completion of the required CI quality and production-image jobs before the deploy job can run.
6. An operator-approved pre-deploy checklist and non-destructive post-deploy smoke checks.

Do not expose Production secrets to PR validation. Do not configure a preview environment to use Production MongoDB, SMTP, private storage, or Atlas resources.

## Health checks and smoke verification

The API image health check calls `GET /api/v1/health/ready`; it remains unhealthy until MongoDB is connected and answers an admin ping. Liveness (`/api/v1/health/live`) only reports process availability. Configure a platform startup grace period longer than ordinary MongoDB connection startup, use readiness for traffic admission, and use liveness for restarts.

After deploying a known immutable revision, perform read-only smoke checks:

```bash
curl --fail https://api.example.com/api/v1/health/live
curl --fail https://api.example.com/api/v1/health/ready
curl --fail https://web.example.com/
curl --fail https://web.example.com/a-client-side-route
```

Verify that the expected full revision appears in the protected metrics scrape or the safe `api_started` log event. These checks must not create accounts, jobs, applications, storage assets, email, database records, or Atlas indexes.

## Rollback

Rollback means redeploying the previously known-good immutable API and web image revisions, then repeating the same live/ready/homepage/direct-route checks. Do not rely on `latest`.

An application image rollback does **not** automatically roll back database documents, Mongoose indexes, Atlas Search indexes, provider configuration, or browser caches. Assess compatibility first; perform any database/index/provider remediation as a separately authorized, controlled operation. Record the target revision, prior revision, approver, smoke result, and any exception in the deployment change record.
