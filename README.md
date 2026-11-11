# RoomRoster

A mobile-first event directory for **MANAGE Agri-Eureka 2026**, built with React, TypeScript, Looseleaf, PostgreSQL, and server-side email/AI matching. Cloudflare Workers is the intended hosting target; Netlify remains supported.

## Current status - November 12, 2026

The frontend and API are deployed to Cloudflare Workers as **roomroster-demo**. Production contains no preview banner or fictional profiles. **Setup is not yet launch-ready.**

- Neon PostgreSQL project **roomroster** is on Free in AWS Singapore. The schema migration succeeded with one default event and zero participants. No Neon Auth or Cloudflare D1 is used.
- Production `DATABASE_URL`, `SESSION_SECRET`, and normalized Gmail `SMTP_PASS` are encrypted runtime secrets, not source files. `APP_URL` is `https://roomroster.me`.
- `roomroster.me` and `www.roomroster.me` are bound to the Worker. Namecheap registration is unchanged; the nameserver change to Cloudflare was saved. Public DNS/HTTPS cutover still needs verification. All five existing mail MX records and SPF were preserved.
- Google 2-Step Verification is enabled for `roomroster07@gmail.com`. One live admin-code email reached that same inbox and its code successfully opened the admin dashboard. The first pre-fix attempt failed; the delivery history correctly retains one sent and one failed message.
- Gmail transport now opens verified TLS by hostname for Workers compatibility. Logs include only allowlisted failure code/stage fields, never SMTP responses, email bodies, addresses, or secrets.
- **No cron triggers are active.** The production build overrides the repository's default cron list with an empty list. Free-plan SQL/subrequest and CPU capacity for batch mail/digests is not validated. Do not enable schedules without bounded batching and capacity checks.
- Local validation: 23 unit/backend tests, six browser suites, production build and Workers packaging passed. Browser attendee flows use local sample data; backend tests use isolated PostgreSQL/PGlite and mocked SMTP. These are not live participant-flow verification.
- Optional AI is not configured. Keyword matching remains available. No paid plan or API spending was used for this setup.

### Remaining launch checks

- [ ] Verify Cloudflare nameserver propagation, certificates and the database-backed frontend on the exact root/www domain.
- [ ] Test two consenting participant accounts end-to-end: registration, delivered verification links, request/accept, contact privacy, removal and unsubscribe. This requires approved recipients and messages; do not test on real attendees without consent.
- [ ] Bound mail/digest work per invocation and validate Workers Free CPU/subrequest limits before enabling cron. Verify only one host runs schedules.
- [ ] Verify scheduled match updates after capacity and recipient approval. No scheduled email has been sent by this deployment.
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

This setup sends welcome emails, connection notifications, recommendations, participant access links, and admin codes. Replies go to your organizer inbox. **It does not forward incoming Gmail messages to another inbox.**

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

Use **Cloudflare Dashboard → Workers & Pages → roomroster → Settings → Variables and Secrets**, or run these commands and enter values at the private prompts:

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

The connected production service is `roomroster-demo` on branch `main`. Its build generates `wrangler.stage.json` from `wrangler.jsonc`, overrides the service name, keeps `workers_dev=true`, sets `vars.APP_URL=https://roomroster.me`, preserves both custom-domain routes and explicitly uses `triggers.crons=[]`.

- Build: `npm run build`, then generate that staged configuration. Keep the saved dashboard build command until a reviewed equivalent is committed.
- Deploy command: `npx wrangler deploy --config wrangler.stage.json`
- Configure runtime secrets in Cloudflare, never in GitHub source files.
- Run database migrations separately before releases that change the schema.

The repository default `wrangler.jsonc` proposes queued mail every five minutes and matching digests at **11:00 and 17:00 Asia/Kolkata**. Those defaults are NOT active in the staged production deployment. A direct deploy of the default config could create a differently named Worker and enable unvalidated schedules; do not use it against production until the deployment configuration is reconciled. Do not expose the local development server as the production site.

## 5. Verify admin login and the complete flow

1. Open `https://YOUR-SITE/admin`.
2. Enter `roomroster07@gmail.com` and click **Email me a sign-in code**. Check inbox and spam.
3. Enter the six-digit code on RoomRoster. It expires after **10 minutes**, works once, and allows at most five incorrect attempts. There is **no permanent admin password**.
4. In the dashboard, check the service configuration and use **Send test email to admin**. A message accepted by Gmail still needs its actual inbox receipt checked.
5. Create a second event. Verify both event lists and participant filtering; `/create` remains a contact-by-email page for visitors.
6. Register two consenting test attendees, confirm their email links, send a connection request, and accept from the recipient's account. Contact details must remain private until acceptance.
7. Remove a test participant and verify their profile and connections disappear from that event.
8. Verify a scheduled match email after a relevant attendee joins, then test the unsubscribe link.

**Email limits also apply to admin sign-in codes and test emails:** maximum three total messages per email address per India calendar day, with at most two recommendation messages. Repeated sign-in/testing can exhaust this allowance. A queued code or email after reaching the cap is expected; do not assume this is a Gmail failure. Admin sessions last eight hours. Participant email links do not grant admin privileges.

## Delivery troubleshooting

| Symptom | Check |
| --- | --- |
| Directory/admin service unavailable | `DATABASE_URL`, migration success, `SESSION_SECRET`, Worker logs. Production never falls back to samples. |
| Code cannot be delivered | Correct Gmail account, 2-Step Verification, app password, `SMTP_USER`, `SMTP_PASS`, `APP_URL`. |
| Code queued / no new email | Daily three-email cap, pending queue, scheduled mail worker, and spam folder. Resend is throttled. |
| Incorrect or expired code | Use the latest delivered code within 10 minutes. Older codes stop working after a new one is delivered. |
| Email links point to localhost or another host | Correct `APP_URL` on the active deployment and request a fresh email. |
| Origin not allowed | `APP_URL` must match the browser's actual site origin, including custom-domain changes. |
| Queue shows `failed` or remains `sending` | Review host logs and SMTP delivery before manually retrying. Ambiguous sends are intentionally not auto-retried. |
| AI unavailable | Check the optional Gemini key/model/quota; skill matching remains available. |

Do not run Netlify and Workers schedules simultaneously against the same database. Choose one active host and disable the other deployment's schedules when switching.

## Netlify alternative

`netlify.toml` remains supported. Add the same environment variables to Netlify, use its configuration from the repository, and redeploy. The configured build runs the idempotent migration when `DATABASE_URL` is present. Publish directory: `dist`; functions: `netlify/functions`. Set `APP_URL` to the Netlify/custom domain instead of the Workers URL. A static drag-and-drop upload alone does not configure the database or email services.

See [PRODUCTION.md](PRODUCTION.md) for provider-specific behavior and [CHECKLIST.md](CHECKLIST.md) for the implementation history.

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

Browser suites use the Vite sample roster for attendee flows and mock admin API responses. Run them with `VITE_DEMO_MODE=true` in the test environment (or an unconfigured local development environment). Do not use real participant data in tests. Backend tests use PostgreSQL/PGlite and mocked SMTP. Passing them does not replace the live checks above.

## Product scope and design

Implemented: event-specific onboarding and directories, optional founder photo/website/LinkedIn, custom needs and offered skills, search and recommendations, recipient-approved contact sharing, multi-event admin controls, and bounded automatic email updates. LinkedIn is an optional link, not a scraper. There is no in-app messaging, SMS, or payments integration.

Looseleaf source components, ink renderer, Kevin Sans font, and license are included; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Original RoomRoster content uses no event logos. The UI is responsive, supports reduced motion, uses local fonts and compressed profile photos, and has automated accessibility coverage.
