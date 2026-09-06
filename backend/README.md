# Media Intelligence Backend — Stage 2

The frontend is intentionally kept separate from secrets and data ingestion. Implement a small HTTPS JSON API against `schema.sql`.

## Required endpoints

- `POST /api/auth/login` — verify password hash, issue short-lived access token and secure refresh token.
- `POST /api/auth/refresh` — rotate refresh token; revoke old token.
- `POST /api/auth/logout` — revoke refresh token.
- `GET /api/me` — current user and role.
- `GET /api/opd` — active OPD list.
- `GET /api/articles?opd_id=&from=&to=&sentiment=&limit=` — monitored news.
- `GET /api/highlights?opd_id=&date=` — daily highlights.
- `POST /api/scans` — authenticated multipart upload for print/PDF scan; create queued job.
- `GET /api/scans/:id` — OCR job status/result.
- `POST /api/intelligence/ask` — authenticated AI question against permitted article data.
- `GET /api/dashboard?opd_id=&from=&to=` — aggregate metrics for the command center.

## Security contract

1. Passwords: Argon2id or bcrypt; never plaintext.
2. Access token: short-lived; do not put secrets or provider API keys in frontend code.
3. Refresh token: random opaque value, store only a hash server-side, rotate on refresh and revoke on logout.
4. Prefer Secure + HttpOnly + SameSite cookies for browser sessions. If bearer access tokens are used, send them only over HTTPS.
5. Validate OPD authorization server-side; never trust a client-supplied role.
6. Validate upload MIME/type/size and store files outside the web root/object storage.
7. Rate-limit login and AI endpoints; audit authentication, uploads and privileged actions.
8. AI providers, crawler credentials and database credentials must be environment variables/server-side secrets.

## Database bootstrap / admin seed

V2 now has an idempotent database seed command:

```bash
npm run db:seed
```

The command first applies `schema.sql`, then creates or repairs the bootstrap admin account. Running it repeatedly will not create duplicate users and will not overwrite an existing admin password unless `ADMIN_PASSWORD` is explicitly supplied.

Default bootstrap credentials:

- **Email:** `admin@pemko.go.id`
- **Password:** `Admin@PemkoBatam2026!`

For production, set a private password through the deployment environment instead of using the bootstrap password:

```bash
ADMIN_EMAIL=admin@pemko.go.id ADMIN_PASSWORD='your-strong-private-password' npm run db:seed
```

`ADMIN_PASSWORD` is hashed with Argon2id before it is stored. No plaintext password is stored in PostgreSQL.

## Ingestion pipeline

`source scheduler -> fetch/RSS/parser -> normalize -> deduplicate(url/hash) -> keyword/entity match -> sentiment/importance -> articles -> highlight/alert aggregates`.

For print media: `upload -> malware/type validation -> object storage -> OCR worker -> normalize text -> same article analysis pipeline`.
