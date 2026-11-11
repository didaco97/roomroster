import { randomUUID } from "node:crypto";
import { db } from "./db";
import { publicProfile, hash } from "./security";
import { match } from "./matching";
import { queue, flush } from "./mail";
export default async function handler() {
  const sql = db();
  const events =
    await sql`SELECT * FROM events WHERE NOT COALESCE((data->>'closed')::boolean,false) AND NOT COALESCE((data->>'pending')::boolean,false)`;
  for (const event of events) {
    const people = await sql`SELECT * FROM profiles WHERE event=${event.slug}`;
    for (const person of people) {
      if (!person.verified || !person.data.alerts) continue;
      const need = [...(person.data.needs || []), person.data.needText || ""]
        .join(" ")
        .trim();
      if (!need) continue;
      const waiting =
        await sql`SELECT id FROM mail_queue WHERE email=${person.email} AND event=${event.slug} AND kind='match' AND state IN ('pending','sending')`;
      if (waiting.length) continue;
      const cursor =
        (
          await sql`SELECT seen FROM digest_cursor WHERE profile=${person.id}`
        )[0]?.seen || person.joined;
      const sent =
        await sql`SELECT candidate FROM match_updates WHERE profile=${person.id}`;
      const connected =
        await sql`SELECT sender,recipient FROM connections WHERE event=${event.slug} AND (sender=${person.id} OR recipient=${person.id})`;
      const excluded = new Set([
        ...sent.map((r) => r.candidate),
        ...connected.flatMap((c) => [c.sender, c.recipient]),
        person.id,
        !!person.data.aiConsent,
      ]);
      const candidates = people.filter((p) => !excluded.has(p.id));
      const result = await match(
        need,
        candidates.map(publicProfile),
        person.id,
      );
      const matches = result.matches.slice(0, 3);
      if (!matches.length) continue;
      const until = new Date().toISOString();
      const count = people.filter(
        (p) =>
          p.id !== person.id &&
          new Date(p.joined) > new Date(cursor) &&
          new Date(p.joined) <= new Date(until),
      ).length;
      await queue(
        person.email,
        event.slug,
        "match",
        {
          profile: person.id,
          count,
          until,
          matches: matches.map((m) => ({
            id: m.profile.id,
            name: m.profile.name,
            reason: m.reason,
          })),
        },
        `match:${person.id}:${hash(
          matches
            .map((m) => m.profile.id)
            .sort()
            .join(","),
        )}`,
      );
    }
  }
  const result = await flush(100);
  await sql`DELETE FROM tokens WHERE expires<now()`;
  await sql`DELETE FROM sessions WHERE expires<now()`;
  await sql`DELETE FROM search_cache WHERE expires<now()`;
  return new Response(JSON.stringify(result));
}
