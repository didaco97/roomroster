# RoomRoster implementation checklist

## Build sequence
- [x] 1. Set up React/TypeScript, actual Looseleaf components/fonts, and Netlify configuration.
- [x] 2. Build event welcome, RoomRoster landing, and event creation pages.
- [x] 3. Build two-step onboarding, optional photo/links, needs and offered skills with custom text.
- [x] 4. Build event directory, search, filters, detail views, recommendation popup, and profile editing.
- [x] 5. Add event-scoped persistence, private contact sharing, email ownership links, and connection requests.
- [x] 6. Add Gemini matching with deterministic fallback, server-side secrets, and quotas.
- [x] 7. Add welcome/connection/match emails, exact event counts, unsubscribe, and daily caps.
- [x] 8. Add organizer controls and deployment/setup documentation.
- [x] 9. Run type checks, production build, domain/security tests, and browser end-to-end tests.
- [x] 10. Inspect mobile/desktop rendering and accessibility; fix issues and record limitations.

## Decisions
- RoomRoster, participant-created MANAGE Agri-Eureka 2026 directory, November 10–14, Hyderabad.
- No event logos. Actual Looseleaf source used with its license and fonts.
- No passwords; email ownership links protect returning profiles and contact acceptance.
- LinkedIn is an optional link in v1; unreliable scraping excluded from onboarding.
- Gmail sender/organizer: roomroster07@gmail.com. Credentials must stay server-side.
- Preview mode uses clearly labeled fictional profiles, local browser storage, and sends no mail.
- Live mode requires PostgreSQL, Gmail app password, signing secret, and Gemini key (optional fallback).
- Three notification emails per email address per day across events; maximum two recommendation emails.
- Pilot timezone is Asia/Kolkata. Ownership links count toward the three-email cap and are also request-throttled.

## Validation record
- 16 domain/backend tests; PostgreSQL engine exercised with SMTP mocked.
- 5 browser suites, including onboarding, search, recipient acceptance, keyboard dismissal, and event isolation.
- Layout checks at 375, 768, and 1440 pixels; no page overflow; screenshots inspected.
- Automated WCAG A/AA checks on landing, event welcome, directory, and onboarding passed.
- TypeScript, Vite production build, and all three function bundles passed.
- Dependency audit: no known vulnerabilities after updates.
- Texture extraction reduced compressed JS from ~362 KB to ~159 KB; fonts are local and use swap rendering.
- External live-service checks are intentionally still open below. No email was sent to real attendees during tests.

## Launch gates (external configuration)
- [ ] Supply database URL and run schema migration.
- [ ] Supply Gmail app password and verify actual delivery.
- [ ] Supply Gemini API key and verify live semantic ranking.
- [ ] Deploy to the chosen host (Workers preferred; Netlify supported) and verify scheduled email delivery.

## Live release update — November 12
- [x] Production builds cannot use preview data, even if an old demo environment flag is set.
- [x] Sample fixtures are excluded from production JavaScript, not just hidden.
- [x] Public event creation replaced with email contact; API requires platform admin authorization.
- [x] Admin dashboard: participants across events, search/filter, removal, event creation, delivery status.
- [x] Admin sign-in uses six-digit email codes, not passwords: 10-minute expiry, one use, five attempts, resend throttle.
- [x] Admin codes and sessions are hashed; participant email links cannot grant admin access.
- [x] Mail queue drain every five minutes, event match digests twice daily, replies routed to the organizer inbox.
- [x] Cloudflare Workers entry point, static asset routing, scheduled jobs, secret configuration, and deployment guide.
- [x] Workers upload dry run and local static/API runtime smoke check.
- [x] 20 domain/server tests and 6 browser suites passed, including admin code replay/expiry/attempt caps and mobile admin accessibility.
- [ ] Renew expired Cloudflare authentication (`npx wrangler login`).
- [ ] Configure live database, SESSION_SECRET, APP_URL and Gmail app password on the chosen host.
- [ ] Run the updated schema migration (adds admin session/code tables).
- [ ] Verify real email-code login, delivery, and scheduled tasks on the deployed host.

Use [PRODUCTION.md](PRODUCTION.md) as the current deployment guide. Workers is now the requested target; the Netlify configuration remains available. No live credential or password was committed.

## User handoff — November 12
- [x] Neon organization setup completed as RoomRoster.
- [x] Private, Git-ignored `.env` prepared on the development computer with the existing session secret.
- [ ] Finish Neon project creation; onboarding was left at region selection. No database project was created in this session.
- [ ] Fill `DATABASE_URL` and `SMTP_PASS`; both remain blank in the prepared `.env`.
- [x] README now contains the pending checklist and complete database, Gmail, admin-code, and Workers setup instructions.
- Account setup and live deployment are handed back to the user at their request.
