import { db } from "./db";
import { publicProfile } from "./security";
import { match } from "./matching";
import { queue, flush } from "./mail";
import { indiaDay } from "../src/domain";
import { ensureDigestJobs } from "./upgrade";

export const DIGEST_CRONS = ["30 7 * * *", "0 16 * * *"];
export function digestSlot(now = new Date()) {
  const india = new Date(now.getTime() + 330 * 60000);
  return `${indiaDay(now)}:${india.getUTCHours() * 60 + india.getUTCMinutes() >= 1290 ? "evening" : "afternoon"}`;
}

// One INSERT queues the whole event. Each minute processes only two people,
// keeping SMTP and optional AI work bounded on Workers Free.
export async function enqueueDigests(slot = digestSlot()) {
  await ensureDigestJobs();
  const sql = db();
  await sql`WITH expired_sessions AS (DELETE FROM sessions WHERE expires<now()), expired_tokens AS (DELETE FROM tokens WHERE expires<now()) DELETE FROM search_cache WHERE expires<now()`;
  await sql`UPDATE mail_queue SET state='cancelled' WHERE kind='connection' AND state='pending'`;
  await sql`INSERT INTO digest_jobs(profile,slot) SELECT p.id,${slot} FROM profiles p JOIN events e ON e.slug=p.event WHERE p.verified AND COALESCE((p.data->>'alerts')::boolean,false) AND NOT COALESCE((e.data->>'closed')::boolean,false) AND NOT COALESCE((e.data->>'pending')::boolean,false) ON CONFLICT DO NOTHING`;
}
export async function processDigests(limit = 2) {
  await ensureDigestJobs();
  const sql = db();
  // Retry interrupted computations only: queue insertion is idempotent per slot.
  const jobs =
    await sql`UPDATE digest_jobs SET state='processing',created=now() WHERE (profile,slot) IN (SELECT profile,slot FROM digest_jobs WHERE (state='pending' OR (state='processing' AND created<now()-interval '5 minutes')) AND slot LIKE ${indiaDay() + ":%"} ORDER BY created FOR UPDATE SKIP LOCKED LIMIT ${limit}) RETURNING *`;
  for (const job of jobs) {
    try {
      const rows =
        await sql`SELECT p.id,p.event,p.email,p.verified,p.joined,p.data-'photo' AS data,e.data AS event_data FROM profiles p JOIN events e ON e.slug=p.event WHERE p.event=(SELECT event FROM profiles WHERE id=${job.profile})`;
      const person = rows.find((p) => p.id === job.profile);
      if (person?.verified && person.data.alerts && !person.event_data.closed) {
        const need = [...(person.data.needs || []), person.data.needText || ""]
          .join(" ")
          .trim();
        const excluded =
          await sql`SELECT candidate AS id FROM match_updates WHERE profile=${person.id} UNION SELECT CASE WHEN sender=${person.id} THEN recipient ELSE sender END AS id FROM connections WHERE sender=${person.id} OR recipient=${person.id}`;
        const ids = new Set([person.id, ...excluded.map((p) => p.id)]);
        const result = need
          ? await match(
              need,
              rows.filter((p) => !ids.has(p.id)).map(publicProfile),
              person.id,
              !!person.data.aiConsent,
            )
          : { matches: [] };
        await queue(
          person.email,
          person.event,
          "match",
          {
            profile: person.id,
            slot: job.slot,
            matches: result.matches
              .slice(0, 3)
              .map((m) => ({
                id: m.profile.id,
                name: m.profile.name,
                reason: m.reason,
              })),
          },
          `digest:${person.id}:${job.slot}`,
        );
      }
      await sql`UPDATE digest_jobs SET state='done' WHERE profile=${job.profile} AND slot=${job.slot}`;
    } catch {
      // No profile text or addresses in logs. A later invocation may retry.
      await sql`UPDATE digest_jobs SET state='pending' WHERE profile=${job.profile} AND slot=${job.slot}`;
    }
  }
}
export default async function handler() {
  await enqueueDigests();
  await processDigests();
  return new Response(JSON.stringify(await flush(2)));
}
