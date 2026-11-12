# RoomRoster

A mobile-first event directory for **MANAGE Agri-Eureka 2026**, built with React, TypeScript, Looseleaf, PostgreSQL, and server-side email/AI matching. Cloudflare Workers is the intended hosting target; Netlify remains supported.

## Current status - November 12, 2026

The frontend and API are deployed to Cloudflare Workers as **roomroster-demo**. Production contains no preview banner or fictional profiles. **This patch is locally verified; deployed participant login and scheduled delivery still need a live smoke check.**

- Neon PostgreSQL project **roomroster** is on Free in AWS Singapore. The schema migration succeeded with one default event and zero participants. No Neon Auth or Cloudflare D1 is used.
- Production `DATABASE_URL`, `SESSION_SECRET`, and normalized Gmail `SMTP_PASS` are encrypted runtime secrets, not source files. `APP_URL` is `https://roomroster.me`.
- `roomroster.me` and `www.roomroster.me` are bound to the Worker. Public Cloudflare nameservers, HTTPS certificates, the seeded event and empty live directory were verified on 12 November 2026. Namecheap registration is unchanged. All five existing mail MX records and SPF were preserved. A Cloudflare Free redirect rule sends HTTPS www requests to the root domain with status 308, preserving paths and query strings; `APP_URL` remains `https://roomroster.me`.
- Google 2-Step Verification is enabled for `roomroster07@gmail.com`. One live admin-code email reached that same inbox and its code successfully opened the admin dashboard. The first pre-fix attempt failed; the delivery history correctly retains one sent and one failed message.
- Gmail transport now opens verified TLS by hostname for Workers compatibility. Logs include only allowlisted failure code/stage fields, never SMTP responses, email bodies, addresses, or secrets.
- This release adds participant email-code sign-in, a 30-day HttpOnly session, persistent profile editing, self-request protection, clearer mobile/upload/loading controls, and scheduled digests.
- Repository schedules now enqueue updates at **1:00 PM and 9:30 PM Asia/Kolkata**. A minute worker prepares at most two digests and sends at most two queued emails per invocation. With 50 recipients, allow roughly 25 minutes to drain a slot, plus provider delays. This is scheduled dispatch, not a promise that every inbox receives mail at the exact minute.
- Automatic mail is limited to three messages per address per India calendar day, including welcome and at most two digests across events. Connection requests appear immediately in the portal and are summarized in those digests. Explicitly requested login codes use separate abuse limits, so digests cannot lock users out.
- The existing runtime database secret can apply this release's two additive tables on first use (`server/upgrade.ts`); no participant data is reset. Running the full migration remains recommended. A database role without CREATE permission must have the migration applied by its owner before deploying.
- Validation: **32 backend/unit tests, seven browser suites, production build, Workers upload dry run and dependency audit (zero known vulnerabilities) passed.** Local regression coverage includes PostgreSQL/PGlite with mocked SMTP, attendee code/session and privacy tests, a 50-recipient batch test, demo and production-API browser flows, mobile layouts and accessibility. These do not prove real inbox delivery or Cloudflare CPU capacity.
- Optional AI is not configured. Keyword matching remains available. No paid plan or API spending was used for this setup.

### Remaining launch checks

- [x] Verify Cloudflare nameservers, certificates and the database-backed frontend on the root domain, with www redirected to the same root path/query.
- [ ] After deployment, test two consenting accounts: welcome code, sign-in, reload/back/edit, request/accept, contact privacy, removal and unsubscribe.
- [x] Bound mail/digest work and test 50 recipients; count SQL operations with headroom for AI and SMTP.
- [ ] Confirm the latest commit deployed and inspect Worker CPU/error metrics during a real scheduled batch. Run schedules on one host only.
- [ ] Verify a real 1 PM and 9:30 PM update, exact event counts, request names, fresh matches and unsubscribe. This patch did not send test mail to attendees.
- [ ] Optional: configure an approved AI provider/model only if wanted, then verify quota fallback.
- [ ] Share the registration link only after the remaining checks pass.

## 1. Prepare your local configuration

Use Node.js **22.12 or newer within the Node 22 LTS line**, or another Node version supported by the installed tools. From the repository folder:

```sh
npm ci
```

On the original development computer, `.env` already exists; **edit it rather than overwriting it**. On a fresh Windows checkout:

```powershell
if (!(Test-Path .env)) { Copy-Item .env.example .env }
```

On macOS/Linux, copy `.env.example` to `.env` if that file does not already exist.

Required configuration:

| Variable | Value / purpose |
| --- | --- |
| `DATABASE_URL` | The PostgreSQL URL copied from Neon. Treat it as a password. |
| `SESSION_SECRET` | A long random secret, at least 32 characters. Keep the existing generated value if available. |
| `SMTP_USER` | `roomroster07@gmail.com` |
| `SMTP_PASS` | Google-generated app password for that same Gmail account. |
| `ADMIN_EMAIL` | `roomroster07@gmail.com`; only this inbox can obtain admin codes. |
| `ORGANIZER_EMAIL` | `roomroster07@gmail.com`; replies to automatic mail go here. |
| `APP_URL` | Your deployed HTTPS origin, with no trailing slash. Used for all email links and origin checks. |
| `GEMINI_API_KEY` | Optional server-side Gemini key. |
| `GEMINI_MODEL` | Defaults to `gemini-2.5-flash`; use a model available to your account. |
| `VITE_DEMO_MODE` | `false` for local full-stack testing. Production always uses the live API. |

If you need a new session secret, generate it locally and place the result in `.env`:

```sh
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Never commit `.env`, `.dev.vars`, `.local/`, or credentials. Never prefix a server secret with `VITE_`; those variables can be exposed to browsers. On the original computer, `.local/netlify-secrets.env` contains the previously generated session secret and admin email; its values work for Workers too despite the filename.

## 2. Create and connect the Neon database

1. Open [Neon Console](https://console.neon.tech/) and sign into your account.
2. Continue the **RoomRoster** organization setup. At the region screen, **AWS Asia Pacific 1 (Singapore)** is a reasonable choice for this India-based pilot from the available options. Review the offered plan before confirming; no paid upgrade has been authorized or selected in this setup.
3. Name the project `roomroster`. If onboarding creates `my-first-project` automatically, rename it in project settings afterward; the name does not affect the connection.
4. In the project dashboard, click **Connect**. Select the production/main branch, database, and role you intend to use. The default database/role are sufficient for this pilot.
5. Copy the PostgreSQL connection string, including its SSL parameters. Copy only the URL beginning `postgresql://` or `postgres://`, not a surrounding `psql` command.
6. Put it in `.env`, for example `DATABASE_URL="YOUR_ACTUAL_NEON_URL"`. Do not post the URL in chat or GitHub.
7. Create the application tables and default event:

```sh
node --env-file=.env --import tsx server/migrate.ts
```

Expected success message: `Schema ready; default event created without sample participants.`

The migration is idempotent and creates events, profiles, connections, email queues/caps, and admin code/session tables. It inserts MANAGE Agri-Eureka 2026 but **does not insert any attendees**. Run it again when deploying schema additions. No separate Neon Auth integration is needed; the application implements its own email verification and admin codes.

Neon reference: [Find your database connection string](https://github.com/neondatabase/website/blob/main/content/faqs/find-database-url-neon.md).

## 3. Enable Gmail sending

1. Sign into Google as **roomroster07@gmail.com**. Check the account avatar so you do not configure another Google account by mistake.
2. Open [Google Account security](https://myaccount.google.com/security) and enable **2-Step Verification** if it is not already enabled. Complete Google's verification yourself.
3. Open [App passwords](https://myaccount.google.com/apppasswords). If prompted for an app name, use `RoomRoster`.
4. Generate the app password. Copy the generated value into `SMTP_PASS` in `.env`; remove any display spaces between its groups. **Do not use your regular Gmail login password.**
5. Keep `SMTP_USER=roomroster07@gmail.com` and configure the same values on your hosting provider in the next section.

If App passwords is unavailable, check [Google's eligibility and troubleshooting instructions](https://support.google.com/accounts/answer/185833). Some account configurations restrict app passwords. The current application uses Gmail SMTP; switching to another provider would require changing the server transport.

This setup sends a welcome email containing the first sign-in code, two opted-in daily event digests containing matches and connection notifications, and separately requested participant/admin sign-in codes. Replies go to your organizer inbox. **It does not forward incoming Gmail messages to another inbox.**

## 4. Deploy to Cloudflare Workers

The repository includes `wrangler.jsonc` and `worker/index.ts`. Workers serves both the built React assets and `/api/*`. PostgreSQL stays on Neon; you do not need to create a Cloudflare D1 database.

### Sign in and establish the Worker URL

```sh
npx wrangler login
npx wrangler whoami
npm run workers:check
npm run workers:deploy
```

Complete Cloudflare's browser sign-in/authorization yourself and confirm the intended account. The initial deploy establishes the `workers.dev` address. **The directory and email login will remain unavailable until the database, secrets, and site URL are configured.**

### Add server secrets

Use **Cloudflare Dashboard → Workers & Pages → roomroster-demo → Settings → Variables and Secrets**, or run these commands and enter values at the private prompts:

```sh
npx wrangler secret put DATABASE_URL
npx wrangler secret put SESSION_SECRET
npx wrangler secret put SMTP_PASS
npx wrangler secret put APP_URL
```

- Set `APP_URL` to the exact deployed URL, such as `https://roomroster.YOUR-SUBDOMAIN.workers.dev`, without a trailing slash. Also update your private `.env` reference value.
- `SMTP_USER`, `ADMIN_EMAIL`, `ORGANIZER_EMAIL`, and `GEMINI_MODEL` are already set in `wrangler.jsonc`.
- Optional AI: run `npx wrangler secret put GEMINI_API_KEY`. Keyword/skill matching works without it.
- Run `npm run workers:deploy` again after configuration, then perform the live checks below.

Choose a Workers plan with suitable CPU/subrequest limits for SQL and scheduled batch emails; free-plan capacity has **not** been validated for the full workload. See [Workers limits](https://developers.cloudflare.com/workers/platform/limits/).

### Automatic GitHub deployment

The connected production service is `roomroster-demo` on branch `main`. `wrangler.jsonc` names that existing service, preserves root/www custom domains, sets `APP_URL=https://roomroster.me`, enables its workers.dev endpoint and declares the two daily digest triggers plus the minute queue processor.

- Build command: `npm run build`
- Deploy command: `npx wrangler deploy`
- Configure runtime secrets in Cloudflare, never in GitHub source files.
- Run `node --env-file=.env --import tsx server/migrate.ts` when credentials are available locally. This release also creates only its missing participant-code/digest-job tables through the existing runtime DB secret; it never overwrites attendees.

Schedules use UTC: `30 7 * * *` = 1 PM IST, `0 16 * * *` = 9:30 PM IST, and `* * * * *` drains small batches. Each profile/slot is deduplicated. Stale digest mail is cancelled rather than delivered on a later India date; only opted-in verified attendees receive updates. Empty-match updates still report event activity. Previously emailed or connected matches are excluded. [Cloudflare Cron documentation](https://developers.cloudflare.com/workers/configuration/cron-triggers/) explains UTC scheduling and propagation delays.

## 5. Verify admin login and the complete flow

1. Open `https://YOUR-SITE/admin`.
2. Enter `roomroster07@gmail.com` and click **Email me a sign-in code**. Check inbox and spam.
3. Enter the six-digit code on RoomRoster. It expires after **10 minutes**, works once, and allows at most five incorrect attempts. There is **no permanent admin password**.
4. In the dashboard, check the service configuration and use **Send test email to admin**. A message accepted by Gmail still needs its actual inbox receipt checked.
5. Create a second event. Verify both event lists and participant filtering; `/create` remains a contact-by-email page for visitors.
6. Register two consenting test attendees, enter their welcome email codes, send a connection request, and accept from the recipient's account. Contact details must remain private until acceptance.
7. Remove a test participant and verify their profile and connections disappear from that event.
8. Verify a scheduled match email after a relevant attendee joins, then test the unsubscribe link.

**Email limits:** three automatic messages per address per India day, at most two digests. Requested admin/participant codes are separate, throttled and single-use, expire after 10 minutes and allow five guesses. Participant resend requests allow eight per address per 24-hour rate bucket and one per minute; the welcome email is separate. Admin sessions last eight hours; participant sessions last 30 days. Participant codes and legacy links never grant admin access.

## Delivery troubleshooting

| Symptom | Check |
| --- | --- |
| Directory/admin service unavailable | `DATABASE_URL`, migration success, `SESSION_SECRET`, Worker logs. Production never falls back to samples. |
| Code cannot be delivered | Correct Gmail account, 2-Step Verification, app password, `SMTP_USER`, `SMTP_PASS`, `APP_URL`. |
| No sign-in code | Check spam, SMTP delivery state and resend cooldown. Requested codes do not use the automatic-mail cap. A failed welcome leaves the saved profile recoverable through Sign in. |
| Incorrect or expired code | Use the latest delivered code within 10 minutes. Older codes stop working after a new one is delivered. |
| Email links point to localhost or another host | Correct `APP_URL` on the active deployment and request a fresh email. |
| Origin not allowed | `APP_URL` must match the browser's actual site origin, including custom-domain changes. |
| Queue shows `failed` or remains `sending` | Review host logs and SMTP delivery before manually retrying. Ambiguous sends are intentionally not auto-retried. |
| AI unavailable | Check the optional Gemini key/model/quota; skill matching remains available. |

Do not run Netlify and Workers schedules simultaneously against the same database. Choose one active host and disable the other deployment's schedules when switching.

## Netlify alternative

`netlify.toml` remains supported. Add the same environment variables to Netlify, use its configuration from the repository, and redeploy. The configured build runs the idempotent migration when `DATABASE_URL` is present. Publish directory: `dist`; functions: `netlify/functions`. Set `APP_URL` to the Netlify/custom domain instead of the Workers URL. A static drag-and-drop upload alone does not configure the database or email services.

See [ISSUES.md](ISSUES.md) for the current fix checklist, [PRODUCTION.md](PRODUCTION.md) for provider-specific behavior and [CHECKLIST.md](CHECKLIST.md) for the implementation history.

## Local development and tests

```sh
npm ci
npm run dev
```

The Vite dev server supports a local-only sample roster when `VITE_DEMO_MODE` is not `false`. If `.env` contains `VITE_DEMO_MODE=false`, use a full-stack server for API calls:

- Workers: put private values in Git-ignored `.dev.vars`, set its `APP_URL=http://localhost:8787`, then run `npm run workers:dev`.
- Netlify: set local `APP_URL=http://localhost:8888` and run `npm run dev:full`.

Keep the deployed `APP_URL` unchanged when testing locally. Local admin features always require the real API and configured email/database; local demo mode does not provide fake admin access.

```sh
npm test
npm run build
npx playwright install chromium
npm run test:e2e
npm run workers:check
npm audit
```

Browser suites start isolated Vite servers on ports 5174 (demo) and 5175 (production API mode). They mock network responses and SMTP; the production-mode suite covers email-code onboarding, reload/back/edit, photo upload, own-profile protection and connection error/retry. No real attendee data is used. Backend tests use PostgreSQL/PGlite and mocked SMTP. Passing them does not replace the live checks above.

## Product scope and design

Implemented: event-specific onboarding and directories, optional founder photo/website/LinkedIn, custom needs and offered skills, search and recommendations, recipient-approved contact sharing, multi-event admin controls, and bounded automatic email updates. LinkedIn is an optional link, not a scraper. There is no in-app messaging, SMS, or payments integration.

Looseleaf source components, ink renderer, Kevin Sans font, and license are included; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Original RoomRoster content uses no event logos. The UI is responsive, supports reduced motion, uses local fonts and compressed profile photos, and has automated accessibility coverage.
