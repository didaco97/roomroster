# RoomRoster

**Live release setup:** read [PRODUCTION.md](PRODUCTION.md) for Cloudflare Workers or Netlify, admin email-code sign-in, and required service configuration. Production builds cannot use the preview roster.

A mobile-first, event-scoped people directory for MANAGE Agri-Eureka 2026. Built with React, TypeScript, the actual Looseleaf source components, PostgreSQL, and Netlify Functions.

## Run the preview

```sh
npm install
npm run dev
```

Open `http://localhost:5173/e/manage-agri-eureka-2026`. Local development supports preview: fictional attendees, browser-local persistence, and **no outgoing email or AI calls**. Register a profile, search, request connections, edit your profile, or explore event pages. Clear the `roomroster-v1` localStorage key to reset. Admin features always use the real API. Public event creation directs visitors to email us.

## Implemented

- RoomRoster landing and event creation; event welcome pages and shareable event/profile URLs.
- Two-step onboarding with optional compressed founder photo, website, LinkedIn, and phone.
- Multi-select needs/offers plus custom text, optional Gemini consent and match emails.
- Directory, live local search suggestions, submitted semantic search, sector filters, sort, profile dialogs, and recommendation popup.
- Passwordless email ownership confirmation. Browsing needs no login; editing/connecting requires the secure email link. No contact info in public API responses.
- Requests and recipient-only acceptance; contact sharing only after acceptance. Accepted contacts are visible in My connections.
- Admin-only event creation, participant management, and event edit/close/remove controls protected by one-time email codes.
- Welcome, connection, ownership-link, and recommendation emails. Global three-mail daily cap per email, with at most two match emails. The pilot day is Asia/Kolkata. Ownership emails count toward the global cap too.
- Scheduled digests at 11:00 and 17:00 IST. Exact per-event counts, no already-emailed or connected/declined matches, unsubscribe and alert preference controls.
- Server-only Gemini integration with text-only consented candidate data, caching, request quotas, and skill/keyword fallback. AI never decides contact permissions or counts.

## Configure a real pilot

1. Create a PostgreSQL database supporting the Neon HTTP driver (Neon or compatible Netlify database).
2. Copy `.env.example` to `.env`. Add `DATABASE_URL`. Generate `SESSION_SECRET` using `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` and save it privately.
3. For `roomroster07@gmail.com`, enable Google two-step verification and create an **app password**, then set `SMTP_PASS` to that value. Never use the ordinary account password. If the account does not allow app passwords, replace the SMTP transport with an email provider before launch.
4. Optionally set `GEMINI_API_KEY` and a model available to that project (`GEMINI_MODEL` defaults to `gemini-2.5-flash`). Without a key or if quota is exhausted, matching falls back to local skill/keyword ranking. Model access and free quotas must be checked in your own AI Studio project.
5. Run the database migration with environment variables loaded:

   ```sh
   node --env-file=.env --import tsx server/migrate.ts
   ```

6. Set `VITE_DEMO_MODE=false` for local full-stack testing. Production always uses the live API. Run `npm run dev:full` for the full API locally. This invokes Netlify CLI using npx; it is not a production dependency. Set `APP_URL=http://localhost:8888` for local full-stack testing.
7. Deploy the repository to Netlify. Build: `npm run build`; publish: `dist`; functions: `netlify/functions`. Set all environment variables in Netlify, with `APP_URL=https://your-site.netlify.app` and `VITE_DEMO_MODE=false`. Server secrets must **never** have a `VITE_` prefix.
8. Run the migration against the production database. It creates the event without sample attendees. Then open `/admin` and request a six-digit sign-in code for `roomroster07@gmail.com`.
9. Share `/e/manage-agri-eureka-2026` only after completing the launch checks in `CHECKLIST.md`.

## Email delivery and scheduling

The scheduled `digest` function securely dispatches `digest-background`, allowing enough runtime for matching and SMTP for approximately 50 attendees. The background handler requires the server secret. Netlify scheduled functions run on deployed production sites; local browser tests do not execute the schedule.

The database mail queue reserves a slot atomically **before** SMTP delivery, so concurrent requests cannot exceed the daily cap. Capped recipients are skipped so other recipients can still receive mail. Emails that fail or have ambiguous SMTP outcomes retain the reservation and are marked `failed`; they are never automatically retried, avoiding duplicate messages. Inspect `mail_queue` and Netlify function logs before manually requeuing. A crash after claiming leaves `sending` rows for manual review. This is conservative delivery accounting, not a claim of exactly-once SMTP delivery.

Connection notifications and ownership links take priority over recommendations. Excess notifications remain queued for a later day. Each email names one event and all its links retain the event context. A click on an email link displays a confirmation form; a GET alone never consumes a token, preventing common mail-link scanners from logging users in. The email link expires in 24 hours; the resulting HttpOnly session expires in 30 days. Unsubscribe links require a confirmation click and remain valid for a year.

## Validation

```sh
npm test
npm run build
npx playwright install chromium
npm run test:e2e
npm audit
```

- Domain tests cover needs versus offered skills, self-exclusion, empty results, daily caps, timezone boundaries, URL/photo validation, and HTML escaping.
- Server tests run actual SQL against PGlite (PostgreSQL engine) while mocking SMTP. They exercise email verification, private contacts, recipient-only acceptance, event isolation, organizer permissions, caps, unsubscribe, and exact digest counts.
- Browser tests cover 375px, 768px, and 1440px layouts, overflow, registration, recommendations, requests, editing, event creation/isolation, and automated WCAG accessibility checks.
- Real Gmail delivery, real Gemini responses, Neon transport, and Netlify deployed scheduling still require the external credentials and live smoke tests. These are not simulated as successful.

## Design and performance

Looseleaf components, ink renderer, CSS tokens, Kevin Sans, and license are included from `kevintngo/looseleaf`. See `public/LOOSELEAF-LICENSE.txt`. IBM Plex Mono is distributed by its fontsource package under OFL. Original RoomRoster content uses no event logos or official event artwork.

Optimizations: bundled/local fonts with swap rendering and only the needed Latin font subset, compressed/cropped 320px profile photos, lazy-loaded images, memoized ink geometry in the upstream library, reduced-motion support, minimum 44px main touch targets, and static cached PNG textures extracted from upstream embedded data. Extraction reduced the application JavaScript from about 746 KB to 476 KB (gzip from 362 KB to 159 KB). The original textures remain intact as standalone files.

## Known pilot boundaries

- LinkedIn is an optional link, not a scraper. No sensitive account cookies are needed.
- No SMS, in-app chat, payment system, or LinkedIn API integration.
- Registrations are public to people with the event link; email confirmation protects privileged actions. Rate limits reduce basic abuse but are not a substitute for moderation.
- Timezone is fixed to India for this pilot. Cross-timezone notification preferences can be added later.
- No fake real-world attendee count: preview counts are labeled samples; live counts come from the event database.
