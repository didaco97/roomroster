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
- [ ] Deploy to Netlify and verify scheduled email delivery on the deployed site.
