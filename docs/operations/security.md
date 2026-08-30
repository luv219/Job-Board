# Security design highlights

This project documents security-oriented controls, not a certification or guarantee of complete security.

- Argon2id password hashing; JWT issuer, audience, and expiry validation.
- Opaque refresh credentials, reset tokens, and verification tokens persisted only as hashes.
- Role and ownership checks at private routes; application data is filtered by Applicant or owned Company.
- Strict Zod request contracts, explicit query/filter construction, bounded bodies/files/pagination, and Mongoose strict schemas.
- Helmet, controlled credentialed CORS, disabled `x-powered-by`, conservative rate limits, and production HSTS.
- Private PDF-only resume handling: signature checking, safe metadata, private storage, short-lived access URLs, and no raw file bytes in MongoDB.
- Pino request logging with correlation IDs and redaction boundaries; tokens, cookies, credentials, bodies, and signed URLs are not logged.
- Test database cleanup requires `NODE_ENV=test` and a database name ending in `_test`; tests use fake providers.

Rate limits are in-memory and therefore per API instance. Production must set HTTPS, trusted proxy topology, least-privilege MongoDB access, protected runtime secrets, SMTP, and storage configuration. `/metrics` requires infrastructure access control; it is not protected by an application-level auth route.
