# RoomRoster issue checklist — 12 November 2026

The repository was refreshed from `origin/main` (`04276f3`). No existing `issues.md` / `ISSUES.md` was present in that revision, local workspace, or open GitHub issues. This checklist records the issues described in the chat; any separate unpublished issue list still needs reconciliation.

## Fixed in this patch

- [x] Registration now pauses at an email-code confirmation step, rather than silently leaving the attendee signed out.
- [x] Welcome mail contains the first six-digit code. Returning attendees request a code, with expiry, single use, attempt limits and resend limits.
- [x] Verified sign-in persists in an HttpOnly 30-day cookie across refresh/back/navigation. The edit route asks returning visitors to sign in, rather than creating another profile.
- [x] Visiting Join while signed in edits the existing profile. Duplicate registration offers sign-in and never overwrites the original profile.
- [x] Own cards say “Your profile” and offer editing; self-requests are rejected by UI, demo and server.
- [x] Requests show sending progress, recover from errors, and show a saved state. Contacts still require recipient acceptance.
- [x] Photo upload has a highlighted, clickable camera/upload target, image preview, progress, removal and size/type validation.
- [x] Mobile spacing, navigation wrapping, touch targets, readable form text, modal focus restoration, reduced motion and loading states improved within the Looseleaf theme.
- [x] Copy shortened in onboarding, navigation, search and profile details.
- [x] Opted-in daily digests queued at 1 PM and 9:30 PM India time, with event total, exact new member count, pending request names, accepted connections and fresh matches. No-match updates explain that honestly.
- [x] Connection notifications are included in the digests. Welcome plus up to two digests stays within three automatic mails per address/day across events; requested login codes are separately throttled.
- [x] Digest work and sending limited to two each per minute invocation. Profile/slot deduplication, no repeated suggested matches, opt-out and date expiry are enforced.
- [x] Fixed the digest AI-consent flag being placed in the exclusion set instead of being passed to matching.
- [x] Additive runtime table upgrade supports the existing Workers DB secret without resetting participant data; normal migrations also include those tables.

## Validation

32 backend/unit tests and nine browser suites passed. TypeScript/production build, Workers upload dry run and dependency audit (zero vulnerabilities) passed.

- [x] PostgreSQL/PGlite tests: attendee/admin code security, restored sessions, failed-delivery recovery, private contacts, event isolation, daily limits, both schedule slots, AI opt-out and a 50-recipient bounded batch.
- [x] Browser checks: demo flows and a separate production-API path covering code onboarding, photo upload, refresh/back/edit, self-profile protection, failed/retried requests, logout and return login.
- [x] Mobile layouts at 320/360/375px plus tablet/desktop; automated WCAG A/AA checks.
- [ ] Confirm the pushed revision reaches the live Workers deployment, then verify real inbox delivery and Worker CPU/subrequest metrics. Local Cloudflare CLI authentication is expired; `.env` has no live DB/SMTP credentials.
- [ ] Verify the next two real schedule slots and unsubscribe in the deployed event. Tests use isolated data and mocked SMTP, not actual attendees.

For 50 opted-in recipients, the minute processor needs roughly 25 minutes to drain a slot, excluding provider delays. Schedule time is the start of dispatch. Do not enable Netlify and Workers schedules against the same database simultaneously. See [README.md](README.md) for setup and release instructions.

## Adaptive layout follow-up

- [x] Reproduced homepage cropping at 364px: header CTA exceeded the viewport and the highlighted heading was forced onto one line.
- [x] Added fluid headline sizing, wrapping highlights/headers/actions, flexible hero columns and event cards; removed absolute positioning from the homepage note.
- [x] Shortened homepage copy and kept the Looseleaf typography, paper and colors.
- [x] Added regression checks for visible text/control bounds and document overflow at 320–1440px, including portrait and landscape, plus the public pages and accessibility.
