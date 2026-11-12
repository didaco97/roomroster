# RoomRoster handoff and open issues

Updated 12 November 2026 (IST). Work stopped for owner review. Scheduled email remains disabled. Do not deploy the experiment patch or apply its SQL to the live pilot without reviewing the items below.

## Current production state

- Frontend/API: https://roomroster.me/ on Cloudflare Worker `roomroster-demo`. `www` redirects to the root domain, preserving path/query. Namecheap registration and existing MX/SPF records were preserved.
- Neon PostgreSQL Free, AWS Singapore, initialized successfully. No D1 or Neon Auth is required. Runtime database/session/SMTP secrets are encrypted outside Git.
- Gmail SMTP and admin sign-in were verified earlier with two approved test attempts: first failed, second received after the SMTP hostname/TLS fix. No participant mail or capacity-test mail was sent.
- Production source before this handoff: `04276f31f34279f780ced14fc812a07a833bacc6`. Default Wrangler deployment uses the existing service/domain and `crons: []`. Pilot data has not been changed for capacity testing. The earlier zero-participant directory check is historical, not a claim about the current roster.
- The production README/domain/setup changes are already committed. This handoff archives experiments without applying them to production code.

## Archived code and reproducing the local evidence

`experiments/pilot-email-progress.patch` contains the bounded cursor and immutable-snapshot prototypes, proposed SQL, mock-only tests, local benchmark, review notes, and fixture-only canary draft. It is intentionally unapplied: no Worker imports, migrations, bindings or Cron wiring are enabled by saving the patch.

Use a disposable checkout of the base commit, not your production working tree:

```sh
git checkout 04276f31f34279f780ced14fc812a07a833bacc6
git apply --check /path/to/pilot-email-progress.patch
git apply /path/to/pilot-email-progress.patch
npm ci
npx vitest run tests/snapshot.test.ts tests/bounded.test.ts tests/domain.test.ts tests/matching.test.ts tests/server.test.ts tests/smtp.test.ts
npx tsc --noEmit
```

The patch was checked against that base and the command above produced 43 passing tests across six files, plus a passing TypeScript check. `tests/capacity.audit.test.ts` is a separate mock-only audit of the old digest's request growth, not part of the 43-test count. No test contacts Gmail, Neon or real participants. The canary draft is outside the normal TypeScript include paths, was bundled earlier, and was not deployed or run.

## Product decisions to preserve

- Sizing target: 50 participants, not evidence that 50 live people are registered.
- Dispatch targets: 11:00 AM, 5:00 PM and 9:30 PM IST daily. Corresponding UTC times: 05:30, 11:30, 16:00. These are on-schedule dispatch targets, not permission for hours-late processing or a promise of exact inbox arrival.
- Approved per-person limits: up to three new-match emails and up to three sign-in/connection emails per day, six total. Send only when there are new eligible matches. This is approved product intent, NOT implemented or activated.
- Existing code still has two match emails and three total emails/person/day. Merely adding a third Cron does not implement the approved behavior and can starve essential mail.
- No paid hosting upgrade, production migration, participant capacity tests or schedule activation is included in this handoff.

## Open issues, in review order

### 1. Production digest exceeds the Free request budget as the roster grows

The current digest batches multiple recipients/candidates/mail work into one invocation. Mock SQL audits show the request count can exceed the Workers Free subrequest budget. Do not enable it for the 50-person target as-is. Measure complete invocation CPU and external requests, including driver/network behavior, before rollout.

### 2. Bounded cursor prototype is too slow for the requested clock times

`server/digest-bounded.ts` caps pages at 16 candidates and preserves full coverage/top-three ranking. A 50-person fixture needs 200 digest invocations and 1,150 SQL requests in total, with a maximum seven observed SQL calls per invocation. At one invocation/minute that is at least 200 minutes, excluding mail. A 1,000-candidate fixture needs 63 invocations and retains the strongest matches from the final page. The cursor avoids truncating candidates but is not the delivery solution.

It also needs a candidate snapshot/revision policy: profile edits during a multi-invocation scan can mix versions. The joined-time cutoff alone is insufficient. Deterministic profile-ID tie ordering is an explicit behavioral change to review.

### 3. Snapshot plus queue prototype is incomplete

`server/digest-snapshot.ts` captures an immutable event/slot roster, excludes photos/contact/link fields, uses ID-only dispatch, and considers all 49 other candidates for each of 50 people. Local fixtures use two SQL requests for capture/job-ID selection and three SQL requests per recipient match. They create 50 fixture mail rows with no SMTP. Five tests cover capture/replay/concurrent completion and eligibility behavior.

Still needed:

- A durable pending-job outbox with publication recovery. A crash after database commit but before queue publication must not strand recipients.
- Exact-mail-ID delivery and an atomic pending-to-sending claim. Generic `flushOne` can send a different pending message on queue redelivery and is not safe identity binding.
- Review the unsuggested-match count/cursor semantics so email counts accurately describe new eligible matches.
- Safe handling of duplicate jobs, expired jobs, crashes and ambiguous SMTP results. Do not automatically retry after a possibly accepted send.
- Live revalidation of opt-out, current need/event state, connections, quotas and sender-wide budget immediately before sending.
- Separate matching and delivery stages; begin with consumer batch size one and delivery concurrency one. These settings are a proposal, not a live configuration.
- A reviewed snapshot retention/deletion rule, replay window, migration/index plan and rollback procedure. No experimental SQL has been applied.

### 4. Full Free-runtime validation is missing

Local rank/decode/encode benchmark: an 89,024-byte, 50-person fixture gave p95 0.735 ms and max 1.114 ms. This excludes database driver, queue consumer, TLS and SMTP work. It is NOT proof of staying under the Workers Free CPU limit.

Required non-sending measurements include cold/warm CPU, all external requests, memory, three 50-job bursts, queue latency/backlog drain, duplicate/crash recovery, and complete database/transport costs. A fixture-only queue/ranking test would not by itself certify the real mailer.

A disposable empty Worker was created, but the dashboard code editor rejected edits and then timed out. A private temporary GitHub deployment path was started but stopped for this handoff. No queue was created, no consumer was attached, and the intended canary never ran. Cleanup status is recorded below.

### 5. Sender limits and deliverability need a production policy

Gmail is not unlimited. A sender-wide daily cap/reserve must cover all events, match mail, essential mail and other use of the same sender. The approved six/person limit is not a sender-wide allowance. Research and choose this budget before activation; do not discover the limit by sending to real people. Rate/reputation restrictions can apply below the documented personal-account ceiling.

Queue operation arithmetic for three 50-person rounds: roughly 450 operations/day with one stage or 900 with two, excluding retries, transactional mail, diagnostics and other account use. Free Queues currently documents 10,000 operations/day and 24-hour retention. These estimates do not prove latency or capacity under failures.

### 6. Astra review did not produce an answer

Three bounded attempts through Codex/API-key authentication used `gpt-6-astra` with high reasoning. The first attempt ended without a recoverable completed response; the next two returned provider `server_error`, confirmed by reading the same response IDs. There is no completed model review to apply.

The aggregate maximum reserved cost is $3.7185875 (about $3.72) against the approved $10 limit. Actual charges are unconfirmed because returned usage was null. This is a conservative bound, not an invoice or confirmed spend. Retries have stopped. Reconcile provider billing before any further model work. No API keys, authentication state or execution logs are included in Git.

### 7. Activation checklist remains open

After fixing the above: review migration/indexes and rollback, run isolated non-sending tests, implement the approved caps, define sender-wide reserve, verify exact recipients/content/eligibility and transport behavior, inspect live settings, then obtain explicit approval for the intended production activation and any real test emails. Preserve pilot records and leave Cron empty until then. No exact-inbox-time guarantee is justified.

## Cleanup

- Disposable `roomroster-fixture-canary-20261112` Worker: deleted from Cloudflare during handoff; no queue or database was attached.
- Temporary private repository of the same name: deleted after GitHub email verification during handoff.
- No disposable queue or fixture database was created. No production schema cleanup is required for the experiments.
- Temporary model key/auth copies were removed. The saved credential was not committed.
- No background expansion, model retries or canary deployment should continue after this handoff.

## Authentication, directory access and self-connect follow-up

Requested during the pilot on 12 November: no-cost authentication, directory access only after registration/basic profile completion, no self-connect requests, and persistent sessions. These are recorded for review, not deployed fixes.

### Confirmed: anonymous directory access must be blocked on the server

A live read-only request to `/api/load` with credentials omitted returned HTTP 200, `me: null`, one participant row and no connections. No participant details are copied here. The directory also renders while signed out. Current `netlify/functions/api.ts` serves `load` and `search` before the authentication check. Hiding the directory button alone would still expose data.

Proposed scope:

- Keep the public event landing page/registration available, but separate public event metadata/counts from member profile data. Do not leak people in landing-page previews, deep links, search results or preloaded responses.
- Require a valid server session, confirmed identity and a complete event profile before returning directory, individual-profile or search data. Define one server-side completeness predicate shared across every relevant endpoint; existing validation requires name, startup, bio, location and a valid sector. Do not silently make optional phone/photo/LinkedIn mandatory.
- Use clear 401/403 responses and a UI redirect to sign in or finish the profile. Gate before SQL profile reads and any model/search work. Keep contacts private until accepted connection.
- Test anonymous, unverified, incomplete, complete, cross-event and organizer access; direct API/deep-link attempts must not bypass the rule. Decide any organizer exception explicitly.

### Recommended no-additional-provider-cost authentication

Keep and repair the email-link authentication already implemented on Workers + Neon. It needs no separate paid auth service for the pilot, using the existing sender and free infrastructure allowances. This is not unlimited free email or a delivery guarantee. Registration currently creates an unverified profile, sends the confirmation link and deliberately issues NO login session. Opening the link and confirming it verifies email ownership and creates the session. The onboarding screen navigates to directory before confirmation, which conflicts with the new access requirement.

The smallest change is a clear verification-pending screen, then the completed-profile directory after verified login. Preserve passwordless return-to-profile access. Review resend limits and essential-mail reserve so digest caps cannot prevent login. Do not authenticate someone solely because they entered an email or finished a browser form.

Optional managed alternative: Supabase Auth Free currently includes 50,000 monthly active users and social OAuth, but adds integration/account-linking work and has free-tier limits/inactivity pausing. Its default SMTP is not for production: only project-team addresses and two messages/hour; real email users need custom SMTP. It would not remove our sending problem. No new service was created.

Sign in with Google is another possible no-email-per-login route to evaluate, not enabled here. Official guidance requires backend ID-token verification, stable `sub` identity, allowed audience/issuer and expiry checks, plus CSRF protection. Request only basic authentication scopes. Link existing pilot accounts only after proving ownership, never by an untrusted client email. The official pages inspected did not establish a specific current pricing promise, so do not represent this handoff as a verified unlimited/free Google service entitlement.

### Sessions already exist; investigate persistence rather than adding browser bearer storage

Current source stores only a SHA-256 hash of an opaque session token in PostgreSQL, expires sessions after 30 days, and sets `rr_session` as HttpOnly, SameSite=Lax, Secure on HTTPS, Path=/, Max-Age=2592000. Normal same-origin fetches can use this cookie. Logout deletes the server session and clears the cookie.

This is persistent authentication across refresh/browser restart after successful email confirmation, subject to browser cookie/privacy settings. JavaScript `sessionStorage` is tab-scoped, not a secure replacement for the server session and not browser-restart persistence. Do not move bearer credentials into localStorage/sessionStorage. Use those only for non-secret UI state if desired. Check the actual confirmation POST/redirect, cookie storage/sending, canonical root-domain return, expiry/logout and private browsing when reproducing the reported behavior. No new login was made during this check.

### Self-connect: reported symptom preserved, exact cause not confirmed

User reports seeing their own profile and a successful request notification after connecting to it. Current main source already rejects `to.id === mine.id` with HTTP 400 before queueing email; schema includes `CHECK(sender<>recipient)`. UI hides the button only when selected ID equals authenticated `me.id`. The production request path and schema therefore have defenses in source, but their runtime effect for this report was NOT tested by making a real request.

Plausible causes to investigate, not conclusions: unverified onboarding leaves `me` null while the new profile is visible; another authenticated account/profile could be active; two same-person records under different email identities could have different IDs; a duplicate/existing pair can return `{ok:true}` without a new request, and the UI always says sent for any successful response. A same-ID backend self-send is not established by the observation alone.

Proposed fixes/tests: preserve server self-ID rejection and database constraint; hide/disable own-profile actions in every UI path including onboarding, reject self-connect in development demo too, derive identity only from server session, and return an explicit created/already-existing/rejected outcome instead of a generic success toast. Add fixture-only API tests that assert self-connect returns 400 with zero connection rows and zero mail, plus UI tests for registration-before-verification, refresh/return login, different active account, duplicate requests and own-card display. Showing your own profile may be acceptable if clearly marked as yours; connecting to it is not. No test participant, connection request or email was created to diagnose this report.

## Sources checked for the design

- https://developers.cloudflare.com/workers/platform/limits/
- https://developers.cloudflare.com/queues/platform/pricing/
- https://developers.cloudflare.com/queues/platform/limits/
- https://developers.cloudflare.com/queues/configuration/batching-retries/
- https://developers.cloudflare.com/queues/reference/delivery-guarantees/
- https://developers.cloudflare.com/queues/configuration/consumer-concurrency/
- https://developers.cloudflare.com/workers/configuration/cron-triggers/
- https://neon.com/docs/serverless/serverless-driver
- https://support.google.com/mail/answer/22839?hl=en
- https://developers.openai.com/api/docs/models/gpt-6-astra
- https://developers.openai.com/api/docs/pricing?context-length=short

- https://supabase.com/pricing
- https://supabase.com/docs/guides/auth/auth-smtp
- https://developers.google.com/identity/siwg/best-practices
- https://developers.google.com/identity/gsi/web/guides/verify-google-id-token
