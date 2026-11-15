# RoomRoster Android app (review build)

The Android app is a Trusted Web Activity (TWA): an installable Android shell
that opens roomroster.me inside Chrome's rendering engine. The web app remains
the single codebase; the app renders whatever the live site serves. Push
notifications use the Web Push standard (VAPID) sent from the existing
Cloudflare Worker - no Firebase project and no extra accounts.

## Compatibility: expected, not yet tested on Android

The app is compiled and its configuration statically verified, but nothing was
run on a phone or emulator (none available in the build environment). The
following are therefore UNTESTED on Android and must be checked on a real
phone before calling the app working:

- App install and launch.
- Sign-in (email code flow) inside the app.
- Directory, profiles, connection request and accept flows.
- Deep links: roomroster.me links opening in the app instead of the browser.
- Notification permission prompt and a real push notification arriving and
  opening the connections page.

## Browser and provider requirements (from the project configuration)

- Minimum Android 7.0 (minSdkVersion 24); targetSdk 36.
- A browser with TWA support must be installed on the phone - Chrome is the
  default and carries the push connection. With `fallbackType: customtabs`
  (current config), phones without a TWA-capable default browser get the site
  in a Custom Tab with a visible URL bar instead of full-screen.
- Full-screen mode (no URL bar) additionally requires the deployed
  `/.well-known/assetlinks.json` on roomroster.me (included in this branch) to
  match the signing certificate fingerprint. Until that is deployed, the app
  opens with a small URL bar.
- Push delivery goes through the browser vendor's push service (FCM for
  Chrome on Android). It requires no Google/Firebase account or key from
  RoomRoster; the VAPID key pair identifies the sender.
- Notification permission: the app declares POST_NOTIFICATIONS (required from
  Android 13). The site asks only signed-in participants, only from a
  "Turn on notifications" button (never on page load), remembers "Not now"
  per device, and silently refreshes the subscription on later visits once
  granted. The TWA delegation service (DelegationService in the manifest)
  lets this web permission cover the installed app.

## What was verified locally (2026-11-15, none of it on a device)

- Web app build (`npm run build`) and all 46 tests pass, including 7 new push
  tests: exact reproduction of the RFC 8291 encryption worked example,
  decryption with the independent `http_ece` implementation, VAPID JWT
  signature verification, subscription store/refresh/remove, 410 cleanup, and
  push triggered on connect request and on accept (payloads contain no phone
  numbers or email addresses).
- Request format check against Google's FCM over the network: a signed push
  request from this code was accepted as well-formed and authenticated
  (410 "unknown endpoint" for a synthetic address vs 400 for an unsigned
  control). This does not prove delivery to any device.
- APK (`roomroster-0.1.0-review.apk`) and AAB compiled with Bubblewrap;
  APK signature verified with apksigner; package `me.roomroster.app`; manifest
  declares the roomroster.me host, the asset statement, and the notification
  permission. App icons rendered from the existing favicon (visually checked).

## What needs approval before users can use it

1. Deploy the branch `android-twa-push-20261115` (service worker, manifest,
   icons, push API actions, assetlinks.json; the additive push_subscriptions
   table self-creates on first use, same lazy-migration pattern as before).
2. Add the `VAPID_PRIVATE_KEY` secret in Cloudflare. The key pair is stored in
   the vault ("RoomRoster VAPID push key"; public key is in wrangler.jsonc).
3. Then run the on-device checklist above before announcing the app.

## Signing

The review APK is signed with a locally generated review keystore kept outside
git (password in the vault entry "RoomRoster Android review keystore").
For a Play Store release later, use Play App Signing and add its fingerprint
to assetlinks.json; the review keystore is not a release key.
