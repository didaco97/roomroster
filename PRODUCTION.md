# RoomRoster live deployment

For the step-by-step user handoff, pending tasks, Neon project creation, and Gmail app-password instructions, start with [README.md](README.md). Account provisioning was stopped at the user's request: the Neon organization exists, but project creation, database connection, Gmail sending, and live deployment remain pending.

## Current release

- Production builds never load preview data or the preview banner, regardless of `VITE_DEMO_MODE`. Local Vite development can still use isolated sample fixtures.
- Visitors use `/create` to contact **roomroster07@gmail.com**. The API rejects public event creation.
- `/admin` uses a six-digit one-time email code restricted to the configured admin inbox, 10-minute code expiry, five verification attempts, resend limits, and an HttpOnly eight-hour session. Codes are HMAC-hashed in the database and consumed once. Participant email links do not grant admin access.
- Admins can view/filter participants across all events, remove profiles, create multiple events, manage each event, see queue status, and send a test email to the admin inbox.
- Automatic outgoing emails use Gmail SMTP. Replies go to roomroster07@gmail.com. This is **not** Gmail inbox forwarding to another address.

## Admin sign-in

Open /admin and use **roomroster07@gmail.com**. Request a code, then enter the six digits on the website. There is no permanent admin password. Gmail delivery must work before login is usable. Sign-in emails count toward the same three-email daily cap; the UI reports when a code is queued. A new delivered code invalidates the previous code.

The generated SESSION_SECRET is kept privately in .local/netlify-secrets.env (also usable on Workers). Import it into the hosting environment; never commit it. Run the schema migration to create admin_sessions and admin_codes. Rotating SESSION_SECRET invalidates admin sessions and existing codes.

## Cloudflare Workers (supported deployment target)

RoomRoster uses a Worker for `/api/*`, static assets for the React app, and Cron Triggers for mail. The database remains Neon/PostgreSQL over HTTPS; a D1 migration is not required. Wrangler's Node compatibility is enabled for crypto and Nodemailer.

1. Sign in with `npx wrangler login`. The previous local Cloudflare token is expired.
2. Set up a Neon database if you do not already have one. Run `node --env-file=.env --import tsx server/migrate.ts` against it. The migration is idempotent and does not seed sample people.
3. Build and initially deploy using `npm run workers:deploy`. This establishes the workers.dev URL; registration remains unavailable until secrets are set.
4. Add the following using **Workers & Pages → roomroster → Settings → Variables and Secrets**, or `npx wrangler secret put NAME`:

   - `DATABASE_URL`
   - `SESSION_SECRET` (generated private value)
   - `SMTP_PASS` (Gmail app password, never your ordinary Gmail password)
   - `APP_URL` (the actual `https://...workers.dev` URL or custom domain, no trailing slash)
   - `GEMINI_API_KEY` (optional; matching falls back when absent)

   Sender/admin addresses and Gemini model are configured in `wrangler.jsonc`. Keep secrets out of that file. For local Workers development, put private values in `.dev.vars` (ignored by Git).
5. Run `npm run workers:check` for an upload dry run, or `npm run workers:dev` for local production-mode rendering.
6. Use an appropriate Workers plan: SQL subrequests and batch email work must fit its CPU/subrequest limits. Do not assume the free plan can support the full workload. Validate real traffic before inviting 50 attendees.
7. Connect the GitHub repository to Workers Builds if automatic deployment is wanted. Build command: `npm run build`. Deploy command: `npx wrangler deploy`. Run database migrations separately before releasing schema changes.

Cron schedules: queued mail every five minutes; matching digests at 11:00 and 17:00 IST. Workers invokes jobs directly; Netlify's background function URLs are not exposed on Workers. Do not run both hosts' schedules against the same production database: choose one active deployment, one `APP_URL`, and disable the old schedules after switching.

## Netlify remains supported

The existing `netlify.toml` remains usable. Set the same environment variables in Netlify and redeploy. Its build runs the schema migration when `DATABASE_URL` is present. If secrets are absent, deployment prints setup warnings and the app shows an unavailable service instead of demo data. The mail pump and matching schedule use protected background functions.

## Required live verification

1. Log into `/admin`, confirm no fictional attendees appear, and create a second event.
2. Use “Send test email to admin”; verify receipt, sender, reply address, and the HTTPS event link.
3. Register two consenting test participants and confirm their emails.
4. Send a connection request, accept as its recipient, and confirm contacts are unavailable before acceptance.
5. Remove a participant; confirm their event profile and connections disappear.
6. Verify scheduled delivery and the three-total/two-recommendation daily cap in the deployed database and logs.
7. Verify the optional Gemini integration with your actual key, then test quota fallback.

Local validation covers SQL behavior using PostgreSQL/PGlite with SMTP mocked, admin authorization, browser interactions, and Workers packaging/runtime. These checks do not prove real Gmail delivery, Neon network access, or deployed Cron execution. Those require the account and secrets above.

## References

- [Workers SPA hosting](https://developers.cloudflare.com/workers/static-assets/routing/single-page-application/)
- [Workers scheduled handler](https://developers.cloudflare.com/workers/runtime-apis/handlers/scheduled/)
- [Workers limits](https://developers.cloudflare.com/workers/platform/limits/)
- [Nodemailer runtime compatibility](https://github.com/nodemailer/nodemailer)
