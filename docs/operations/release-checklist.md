# Release checklist

Use this checklist for an authorized release. It deliberately does not run migrations, seed data, send test email, delete storage, recreate Atlas Search indexes, or modify DNS/TLS.

## Before build

- Confirm the source revision is a reviewed immutable commit on the approved release path.
- Confirm `npm ci`, lint, typecheck, test, coverage, build, audit, and production-image CI jobs passed for that revision.
- Choose the exact API and web immutable image tags; record the prior known-good tags for rollback.
- Confirm the production secret/configuration store contains valid runtime values without copying them into build arguments, logs, image labels, or tickets.
- Confirm `WEB_ORIGIN`, `VITE_API_BASE_URL`, HTTPS, CORS, cookie domain, and verified `TRUST_PROXY_HOPS` match the intended topology.
- Confirm Production uses its own least-privilege MongoDB principal and does not point at local, test, preview, or shared-development data.
- Confirm Atlas Search mode/index, if enabled, was provisioned and validated by an explicit operations process. Application startup must not mutate it.

## Deployment gate

- Use a protected Production environment with required approval and environment-scoped secrets.
- Deploy only the reviewed immutable artifacts after required CI completion.
- Serialize Production deployments with a target-specific concurrency lock; do not cancel an already-running release automatically.
- Do not run a deploy from a pull request, fork, untrusted branch, or a workflow with elevated write permissions.

## After deploy

- Check API live and ready endpoints through the intended public/proxy path.
- Check the web homepage and one direct client route.
- Confirm the expected revision in protected metrics or the safe API startup log.
- Check structured logs for configuration, MongoDB, and shutdown errors without revealing secrets.
- Confirm no smoke action created data, storage assets, email, or provider/index changes.

## Rollback decision

- If rollback is necessary, redeploy the recorded previous immutable API and web tags.
- Treat database, Mongoose-index, Atlas Search-index, provider-config, and CDN/browser-cache effects as separate compatibility decisions; no automatic rollback is implied.
- Repeat the post-deploy smoke checks and record the outcome.
