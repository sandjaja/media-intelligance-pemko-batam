# Security audit remediation — 17 October 2026

Base: `6eb95a17f9f92ee815b738e8de7a89e51d6d3a89`.

Preview and production share the database according to the project owner. No migrations or database writes were run during this work. All regression tests use mocks; paid AI, Apify, SMTP delivery, schedulers and production deployment were not invoked.

| Audit finding | Remediation |
| --- | --- |
| P1-01 Legacy scope and permissions | Current normalized roles guard legacy writes. Online lists/highlights/alerts enforce OPD/district and final approval. Print lists/details/evidence, alternate evidence recovery and warning signals enforce unit and analyzed state. Scoped users cannot read the city brief cache or legacy aggregate endpoint. File access also checks the file's association with an authorized article. Humas retains city-wide operational access. |
| P1-02 Incident child joins | Task and decision updates join their exact parent incident. Legacy null OPD scope fails closed; OPD/district cannot use legacy operational writes. |
| P1-03 Revoked/stale sessions | Root API hook requires a live refresh grant bound to the access JWT, reads current roles/account state, and supplies current claims to older guards. Password changes and administrator edits revoke grants; TV device grants are also revoked on credential/account changes. Session restoration cannot accept a copied access JWT alone. |
| P1-04 URL fetching | Shared HTTP(S) transport checks all DNS answers, pins a validated public address for the connection, rechecks every redirect, blocks URL credentials/private/special addresses, caps streamed bytes and enforces timeout. Used by Content Studio, publication extraction, online/owned website collectors, article verification and map imports. |
| P1-05 Proxy/rate limits | Only the Vercel adapter's loopback hop is trusted. One platform-provided, validated client IP replaces forwarded headers. Authentication attempt limits additionally use transaction-serialized database counters shared across instances, with hashed IP/account keys. |
| P2-06 Server idle expiry | Existing refresh grant expiry is a rolling 15-minute server deadline, with an absolute configured lifetime. Actual user activity sends a throttled heartbeat while writing drafts. Dedicated TV grants retain their separate lifetime. |
| P2-07 Stale brief claim | Expired running claims display as failed and allow one explicit retry. Retry-used flags still prevent additional AI calls. Initial workers cannot overwrite a manual retry. Existing ready results remain visible on 503. |
| P2-08 Startup recovery | Failed initialization clears the single-flight promise, with a five-second backoff before another attempt. |
| P2-09 Dependency advisories | Nodemailer upgraded to 10.1.2; committed lockfile, compiler and test transformer make installs reproducible. CI uses npm ci. |
| P2-10 SMTP recovery | Public forgot-password response does not wait for account lookup or SMTP. Adapter-scoped background work is registered with Vercel waitUntil. Failures invalidate reset tokens and appear in the existing notification history; the generic message directs users to Administrator if email does not arrive. No hidden administrative queue is created. |
| P2-11 Regression coverage/classifier | Restored a branch accidentally commented by literal escaped newlines. Primary-keyword routing gates remain intact; historical articles were not reprocessed. Updated stale fixtures and included all offline regression suites in default CI. Live-database suites remain explicitly opt-in. |
| P2-12 Public diagnostics | Disabled the unbounded unauthenticated diagnostic logging endpoint. |

## Verification

- TypeScript check and production build pass.
- 677 local tests pass, including real legacy handler execution, actual print route SQL, copied/revoked access tokens, idle restoration, DNS/redirect/body-size attacks, database-shared auth throttling, asynchronous reset responses, stale brief retry, alternate evidence access, and startup recovery.
- Runtime dependency audit reports zero advisories at verification time. This is an advisory scan, not a proof of complete security.
- JavaScript syntax checks and git diff whitespace checks pass.
- No schema changes are required for this commit.

## Release notes and remaining verification

Existing normal sessions from older releases must sign in once after this deployment because they lack the new session binding and server idle deadline. Dedicated TV grants continue separately. Do not roll the old frontend/server authentication code back while retaining new short-lived grants without reviewing session behavior.

Live SMTP delivery, real production logins for each role, and the Vercel background delivery lifecycle still require a deployment smoke test. They were not tested against the shared production database or real recipients. Authentication throttling uses the existing audit log index; monitor its storage growth under sustained abuse. The general non-authentication API limiter remains per instance, while sensitive authentication limits are database-shared.

This audit does not certify third-party services, complete git history, infrastructure permissions or future dependency releases.
