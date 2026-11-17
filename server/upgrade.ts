import { db } from "./db";

// Additive compatibility upgrade for existing Workers deployments whose database
// credentials live only in runtime secrets. No attendee data is changed or removed.
// The full schema remains in schema.sql for fresh installs and normal migrations.
let authReady: Promise<unknown> | undefined;
let digestsReady: Promise<unknown> | undefined;
export function ensureParticipantCodes() {
  return (authReady ||=
    db()`CREATE TABLE IF NOT EXISTS participant_codes (event text NOT NULL, email text NOT NULL, hash text NOT NULL, expires timestamptz NOT NULL, attempts integer NOT NULL DEFAULT 0, PRIMARY KEY(event,email), FOREIGN KEY(event,email) REFERENCES profiles(event,email) ON DELETE CASCADE)`.catch(
      (e) => {
        authReady = undefined;
        throw e;
      },
    ));
}
export function ensureDigestJobs() {
  return (digestsReady ||=
    db()`CREATE TABLE IF NOT EXISTS digest_jobs (profile uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE, slot text NOT NULL, state text NOT NULL DEFAULT 'pending', created timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(profile,slot))`.catch(
      (e) => {
        digestsReady = undefined;
        throw e;
      },
    ));
}
let messagesReady: Promise<unknown> | undefined;
// Additive: nullable note on a connection request. Existing rows are untouched.
export function ensureConnectionMessages() {
  return (messagesReady ||=
    db()`ALTER TABLE connections ADD COLUMN IF NOT EXISTS message text`.catch(
      (e) => {
        messagesReady = undefined;
        throw e;
      },
    ));
}
let noticesReady: Promise<unknown> | undefined;
// Additive: per-person count of request/acceptance notices sent today.
export function ensureMailNotices() {
  return (noticesReady ||=
    db()`ALTER TABLE daily_mail ADD COLUMN IF NOT EXISTS notices integer NOT NULL DEFAULT 0`.catch(
      (e) => {
        noticesReady = undefined;
        throw e;
      },
    ));
}
let pushReady: Promise<unknown> | undefined;
// Additive: one row per browser/device subscription. Endpoints and keys belong to
// the subscriber's browser, not to other participants; removed on unsubscribe or
// when the push service reports them gone.
export function ensurePushSubscriptions() {
  return (pushReady ||=
    db()`CREATE TABLE IF NOT EXISTS push_subscriptions (endpoint text PRIMARY KEY, profile uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE, p256dh text NOT NULL, auth text NOT NULL, created timestamptz NOT NULL DEFAULT now())`.catch(
      (e) => {
        pushReady = undefined;
        throw e;
      },
    ));
}

let fcmReady: Promise<unknown> | undefined;

// Native Android FCM tokens: one row per device token, written by the
// signed-in app; removed on unsubscribe or when FCM reports them gone.
export function ensureFcmTokens() {
  return (fcmReady ||=
    db()`CREATE TABLE IF NOT EXISTS fcm_tokens (token text PRIMARY KEY, profile uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE, created timestamptz NOT NULL DEFAULT now())`.catch(
      (e) => {
        fcmReady = undefined;
        throw e;
      },
    ));
}
