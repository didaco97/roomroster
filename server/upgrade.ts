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
