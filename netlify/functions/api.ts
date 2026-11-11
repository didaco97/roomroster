import { randomUUID } from "node:crypto";
import { db } from "../../server/db";
import {
  identity,
  profileSchema,
  eventSchema,
  emailSchema,
  publicProfile,
  rate,
  hash,
  opaque,
  escapeHtml as h,
} from "../../server/security";
import { queue, flush } from "../../server/mail";
import { match } from "../../server/matching";
const json = (
  data: unknown,
  status = 200,
  headers: Record<string, string> = {},
) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...headers,
    },
  });
export default async function handler(req: Request) {
  try {
    const url = new URL(req.url);
    const action = url.pathname.split("/").filter(Boolean).pop();
    if (action === "link") return await link(req, url);
    if (req.method !== "POST") return json({ error: "Use POST." }, 405);
    if (
      req.headers.get("origin") &&
      req.headers.get("origin") !==
        new URL(process.env.APP_URL || req.url).origin
    )
      return json({ error: "Origin not allowed." }, 403);
    if (!req.headers.get("content-type")?.includes("application/json"))
      return json({ error: "JSON required." }, 415);
    const raw = await req.text();
    if (raw.length > 210000)
      return json({ error: "Profile is too large." }, 413);
    const b = JSON.parse(raw);
    const sql = db();
    const email = await identity(req);
    const ip = req.headers.get("x-nf-client-connection-ip") || "unknown";
    await rate(`api:${ip}`, 120, 1);
    if (action === "events")
      return json(
        (
          await sql`SELECT data FROM events WHERE NOT COALESCE((data->>'pending')::boolean,false) ORDER BY data->>'start' DESC`
        ).map((r) => r.data),
      );
    if (action === "create-event") {
      await rate(`create:${ip}`, 3);
      const owner = emailSchema.parse(b.email);
      const details = eventSchema.parse(b.details);
      const slug =
        details.name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .slice(0, 65)
          .replace(/^-|-$/g, "") +
        "-" +
        randomUUID().slice(0, 6);
      await sql`INSERT INTO events(slug,owner,data) VALUES(${slug},${owner},${JSON.stringify({ ...details, slug, pending: true })}::jsonb)`;
      await queue(owner, slug, "create", details, `create:${slug}`);
      await flush(1);
      return json({
        message:
          "Check your email to confirm and create your event. If delivery is delayed, contact the platform organizer.",
      });
    }
    const event = String(b.event || "");
    const ev = (
      await sql`SELECT * FROM events WHERE slug=${event} AND NOT COALESCE((data->>'pending')::boolean,false)`
    )[0];
    if (!ev) return json({ error: "Event not found." }, 404);
    const isAdmin =
      !!email &&
      (email === ev.owner ||
        email === (process.env.ORGANIZER_EMAIL || "roomroster07@gmail.com"));
    const mine = email
      ? (
          await sql`SELECT * FROM profiles WHERE event=${event} AND email=${email}`
        )[0]
      : null;
    if (action === "load") {
      const rows =
        await sql`SELECT * FROM profiles WHERE event=${event} ORDER BY joined`;
      const connections = mine
        ? await sql`SELECT c.id,c.event,c.sender AS "from",c.recipient AS "to",c.status,c.created,CASE WHEN c.status='accepted' THEN p.email ELSE NULL END AS email,CASE WHEN c.status='accepted' THEN p.phone ELSE NULL END AS phone FROM connections c JOIN profiles p ON p.id=CASE WHEN c.sender=${mine.id} THEN c.recipient ELSE c.sender END WHERE c.event=${event} AND (c.sender=${mine.id} OR c.recipient=${mine.id})`
        : [];
      return json({
        event: ev.data,
        profiles: rows.map(publicProfile),
        me: mine
          ? {
              ...publicProfile(mine),
              email: mine.email,
              phone: mine.phone,
              verified: mine.verified,
            }
          : null,
        connections,
        admin: isAdmin,
      });
    }
    if (action === "access") {
      const address = emailSchema.parse(b.email);
      await rate(`access:${address}`, 2);
      await rate(`access-ip:${ip}`, 5);
      const p = (
        await sql`SELECT id FROM profiles WHERE event=${event} AND email=${address}`
      )[0];
      if (
        p ||
        address === ev.owner ||
        address === (process.env.ORGANIZER_EMAIL || "roomroster07@gmail.com")
      ) {
        await queue(address, event, "access", {}, `access:${randomUUID()}`);
        await flush(1);
      }
      return json({
        message:
          "If this email belongs to a participant or organizer, a secure link is on its way. Check your inbox and spam folder.",
      });
    }
    if (action === "register") {
      if (ev.data.closed)
        return json({ error: "This event has closed registrations." }, 409);
      await rate(`register:${ip}`, 10);
      const p = profileSchema.parse(b.profile);
      const id = randomUUID();
      const { email: address, phone, ...data } = p;
      const inserted =
        await sql`INSERT INTO profiles(id,event,email,phone,data) VALUES(${id},${event},${address},${phone},${JSON.stringify(data)}::jsonb) ON CONFLICT(event,email) DO NOTHING RETURNING *`;
      if (!inserted.length)
        return json(
          {
            error:
              "This email already has a profile. Use “Return to your profile” to receive a secure link.",
          },
          409,
        );
      await queue(address, event, "welcome", { name: p.name }, `welcome:${id}`);
      await flush(1);
      // No identity is issued until email ownership is confirmed.
      return json({ ok: true, id, verificationRequired: true });
    }
    if (action === "search") {
      await rate(`search:${ip}`, 15, 1);
      const query = String(b.query || "").slice(0, 400);
      const rows = await sql`SELECT * FROM profiles WHERE event=${event}`;
      const self = mine?.id || (rows.some(row => row.id === b.self) ? b.self : undefined);
      return json(await match(query, rows.map(publicProfile), self, b.useAI !== false));
    }
    if (action === "logout") {
      const token = req.headers.get("cookie")?.match(/rr_session=([^;]+)/)?.[1];
      if (token) await sql`DELETE FROM sessions WHERE hash=${hash(token)}`;
      return json({ ok: true }, 200, {
        "Set-Cookie":
          "rr_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0; Secure",
      });
    }
    if (!email)
      return json(
        { error: "Use the secure link in your email to continue." },
        401,
      );
    if (action === "event-update") {
      if (!isAdmin) return json({ error: "Organizer access required." }, 403);
      const details = eventSchema.parse(b.details);
      await sql`UPDATE events SET data=${JSON.stringify({ ...ev.data, ...details })}::jsonb WHERE slug=${event}`;
      return json({ ok: true });
    }
    if (action === "remove") {
      if (!isAdmin) return json({ error: "Organizer access required." }, 403);
      await sql`DELETE FROM profiles WHERE id=${String(b.id)}::uuid AND event=${event}`;
      return json({ ok: true });
    }
    if (!mine) return json({ error: "Join this directory first." }, 403);
    if (action === "update") {
      const p = profileSchema.parse({ ...b.profile, email });
      const { email: _, phone, ...data } = p;
      await sql`UPDATE profiles SET phone=${phone},data=${JSON.stringify(data)}::jsonb WHERE id=${mine.id}`;
      return json({ ok: true });
    }
    if (action === "connect") {
      if (!mine.verified)
        return json(
          { error: "Confirm your email before sending connection requests." },
          403,
        );
      await rate(`connect:${mine.id}`, 15);
      const to = (
        await sql`SELECT * FROM profiles WHERE id=${String(b.to)}::uuid AND event=${event}`
      )[0];
      if (!to || to.id === mine.id)
        return json(
          { error: "Choose another participant in this event." },
          400,
        );
      const added =
        await sql`INSERT INTO connections(id,event,sender,recipient) VALUES(${randomUUID()},${event},${mine.id},${to.id}) ON CONFLICT DO NOTHING RETURNING id`;
      if (added.length) {
        await queue(
          to.email,
          event,
          "connection",
          { name: mine.data.name },
          `connection:${added[0].id}`,
        );
        await flush(1);
      }
      return json({ ok: true });
    }
    if (action === "respond") {
      if (typeof b.accept !== "boolean")
        return json({ error: "Choose accept or decline." }, 400);
      const updated =
        await sql`UPDATE connections SET status=${b.accept ? "accepted" : "declined"} WHERE id=${String(b.id)}::uuid AND recipient=${mine.id} AND event=${event} AND status='pending' RETURNING id`;
      if (!updated.length)
        return json(
          {
            error:
              "This request is no longer pending or belongs to another person.",
          },
          409,
        );
      return json({ ok: true });
    }
    return json({ error: "Action not found." }, 404);
  } catch (e: any) {
    if (e.name === "ZodError")
      return json(
        { error: e.issues?.[0]?.message || "Please check your details." },
        400,
      );
    if (e instanceof SyntaxError)
      return json({ error: "Invalid request." }, 400);
    return json(
      {
        error: e.status
          ? e.message
          : "This service is temporarily unavailable. Please try again shortly.",
      },
      e.status || 503,
    );
  }
}
async function link(req: Request, url: URL) {
  const token = url.searchParams.get("token") || "";
  if (!/^[A-Za-z0-9_-]{43}$/.test(token))
    return new Response("Invalid link.", { status: 400 });
  const sql = db();
  const rows =
    await sql`SELECT * FROM tokens WHERE hash=${hash(token)} AND expires>now()`;
  if (!rows.length)
    return new Response(
      "This link expired or was already used. Return to the event and request a new link.",
      { status: 410 },
    );
  const t = rows[0];
  if (req.method === "GET") {
    const title =
      t.kind === "unsubscribe"
        ? "Turn off match emails?"
        : "Continue to your room";
    return new Response(
      `<!doctype html><html lang="en"><meta name="viewport" content="width=device-width"><title>RoomRoster — confirm</title><body style="background:#f8f5ee;color:#2a2420;font-family:Georgia;padding:40px;max-width:550px;margin:auto"><h2>roomroster ✳</h2><h1>${title}</h1><p>${t.kind === "unsubscribe" ? "This stops recommendation emails for this event. Connection requests still reach you within your daily limit." : "Confirm to securely access your event. This link can be used once."}</p><form method="POST"><button style="padding:16px;background:#2a2420;color:#fff;border:0;font-size:16px">${t.kind === "unsubscribe" ? "Turn off match emails" : "Continue securely"}</button></form></body></html>`,
      {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Referrer-Policy": "no-referrer",
          "Cache-Control": "no-store",
        },
      },
    );
  }
  if (req.method !== "POST")
    return new Response("Method not allowed", { status: 405 });
  const used =
    await sql`DELETE FROM tokens WHERE hash=${hash(token)} AND expires>now() RETURNING *`;
  if (!used.length) return new Response("Link already used.", { status: 410 });
  if (t.kind === "unsubscribe") {
    await sql`UPDATE profiles SET data=jsonb_set(data,'{alerts}','false') WHERE event=${t.event} AND email=${t.email}`;
    return new Response(
      "Match emails are turned off for this event. You can enable them again in your profile.",
      { headers: { "Content-Type": "text/plain" } },
    );
  }
  if (t.kind === "create")
    await sql`UPDATE events SET data=data-'pending' WHERE slug=${t.event} AND owner=${t.email}`;
  await sql`UPDATE profiles SET verified=true WHERE event=${t.event} AND email=${t.email}`;
  const session = opaque();
  await sql`INSERT INTO sessions(hash,email,expires) VALUES(${hash(session)},${t.email},now()+interval '30 days')`;
  return new Response(null, {
    status: 303,
    headers: {
      Location: `${process.env.APP_URL}/e/${encodeURIComponent(t.event)}/${t.kind === "create" ? "organizer" : "connections"}`,
      "Set-Cookie": `rr_session=${session}; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000${process.env.APP_URL?.startsWith("https:") ? "; Secure" : ""}`,
      "Cache-Control": "no-store",
    },
  });
}
