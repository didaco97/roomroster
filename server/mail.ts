import nodemailer from "nodemailer";
import { gmailTransportOptions, safeMailFailure } from "./smtp";
import { randomUUID } from "node:crypto";
import { db } from "./db";
import { createToken, escapeHtml as h } from "./security";
import { indiaDay } from "../src/domain";
import { issueAdminCode, adminEmail } from "./admin";
import { issueParticipantCode } from "./participant-auth";
import { ensureMailNotices } from "./upgrade";

// Approved ceiling per person per day: 3 match + 3 essential (sign-in codes,
// welcome, access links, request and acceptance notices). Notices use at most 2 of the 3
// essential slots so a sign-in code is never crowded out. Match stays at 2/day
// until a third round is separately turned on. Sender-wide: a daily cap on the
// Gmail account, with a reserve that only sign-in codes may use.
export const MATCH_PER_DAY = 2;
export const ESSENTIAL_PER_DAY = 3;
export const NOTICES_PER_DAY = 2;
export function senderLimits() {
  const cap = Number(process.env.SENDER_DAILY_CAP) || 300;
  return { cap, softCap: Math.max(1, cap - Math.min(40, Math.floor(cap / 5))) };
}
const SENDER = "*";
function mailClass(kind: string) {
  return kind === "match"
    ? "match"
    : kind === "connection" || kind === "accepted"
      ? "notice"
      : "essential";
}
export async function queue(
  email: string,
  event: string,
  kind: string,
  data: object,
  dedupe: string,
) {
  const sql = db();
  await sql`INSERT INTO mail_queue(id,email,event,kind,data,dedupe) VALUES(${randomUUID()},${email},${event},${kind},${JSON.stringify(data)}::jsonb,${dedupe}) ON CONFLICT(dedupe) DO NOTHING`;
}
export function emailTemplate(
  title: string,
  body: string,
  url: string,
  label: string,
  unsubscribe?: string,
) {
  return `<html><body style="margin:0;background:#f8f5ee;color:#2a2420;font-family:Georgia,serif"><div style="max-width:540px;margin:auto;padding:36px 24px"><p style="font-size:25px;font-weight:bold">roomroster ✳</p><div style="border:1px solid #8e8270;padding:28px;background:#fffaf0"><h1 style="font-size:27px">${h(title)}</h1>${body}<p style="margin:28px 0"><a href="${h(url)}" style="background:#2a2420;color:#fffaf0;padding:14px 20px;text-decoration:none;display:inline-block">${h(label)} →</a></p></div><p style="font-size:12px">Participant-created directory · Good people. Same room.</p>${unsubscribe ? `<p><a href="${h(unsubscribe)}">Turn off match updates for this event</a></p>` : ""}</div></body></html>`;
}
export async function flush(
  limit = 2,
  recipient: string | null = null,
  dedupe: string | null = null,
) {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS)
    return { sent: 0, configured: false };
  await ensureMailNotices();
  const sql = db();
  const transport = nodemailer.createTransport(gmailTransportOptions());
  let sent = 0;
  for (let i = 0; i < limit; i++) {
    const day = indiaDay();
    // Authentication mail has its own request limits; it must never wait behind digests.
    const lim = senderLimits();
    const claimed =
      await sql`UPDATE mail_queue SET state='sending' WHERE id=(SELECT q.id FROM mail_queue q WHERE q.state='pending' AND (${recipient}::text IS NULL OR q.email=${recipient}) AND (${dedupe}::text IS NULL OR q.dedupe=${dedupe}) AND (q.kind IN ('admin-code','participant-code') OR COALESCE((SELECT g.total FROM daily_mail g WHERE g.email=${SENDER} AND g.day=${day}),0)<${lim.softCap}) AND (NOT EXISTS(SELECT 1 FROM daily_mail d WHERE d.email=q.email AND d.day=${day} AND ((q.kind='match' AND d.recommendations>=${MATCH_PER_DAY}) OR (q.kind IN ('connection','accepted') AND (d.notices>=${NOTICES_PER_DAY} OR d.total-d.recommendations>=${ESSENTIAL_PER_DAY})) OR (q.kind<>'match' AND q.kind NOT IN ('connection','accepted') AND d.total-d.recommendations>=${ESSENTIAL_PER_DAY})))) ORDER BY CASE WHEN q.kind IN ('admin-code','participant-code') THEN 0 WHEN q.kind='match' THEN 2 ELSE 1 END,q.created FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING *`;
    if (!claimed.length) break;
    const m = claimed[0];
    const auth = m.kind === "admin-code" || m.kind === "participant-code";
    if (
      (auth && new Date(m.created).getTime() < Date.now() - 10 * 60000) ||
      (m.kind === "match" && m.data.slot && !m.data.slot.startsWith(day))
    ) {
      await sql`UPDATE mail_queue SET state='cancelled' WHERE id=${m.id}`;
      continue;
    }
    const ev = (await sql`SELECT data FROM events WHERE slug=${m.event}`)[0]
      ?.data;
    if (!ev) {
      await sql`UPDATE mail_queue SET state='cancelled' WHERE id=${m.id}`;
      continue;
    }
    if (m.kind === "match") {
      const recipient = (
        await sql`SELECT id,data-'photo' AS data,verified,joined FROM profiles WHERE event=${m.event} AND email=${m.email}`
      )[0];
      if (ev.closed || !recipient?.verified || !recipient.data.alerts) {
        await sql`UPDATE mail_queue SET state='cancelled' WHERE id=${m.id}`;
        continue;
      }
      const cursor =
        (
          await sql`SELECT seen FROM digest_cursor WHERE profile=${recipient.id}`
        )[0]?.seen || recipient.joined;
      m.data.until = new Date().toISOString();
      m.data.count = Number(
        (
          await sql`SELECT count(*) FILTER (WHERE id<>${recipient.id} AND joined>${cursor}) AS count FROM profiles WHERE event=${m.event} AND joined<=${m.data.until}`
        )[0].count,
      );
      const available =
        await sql`SELECT p.id,p.data->>'name' AS name FROM profiles p WHERE p.event=${m.event} AND p.id<>${recipient.id} AND NOT EXISTS(SELECT 1 FROM connections c WHERE (c.sender=${recipient.id} AND c.recipient=p.id) OR (c.recipient=${recipient.id} AND c.sender=p.id))`;
      m.data.matches = m.data.matches.filter((p: any) =>
        available.some((a) => a.id === p.id),
      );
      m.data.matches = m.data.matches.map((p: any) => ({
        ...p,
        name: available.find((a) => a.id === p.id)?.name || p.name,
      }));
      const stats = (
        await sql`SELECT (SELECT count(*)::int FROM profiles WHERE event=${m.event}) AS total,(SELECT count(*)::int FROM connections WHERE event=${m.event} AND status='accepted' AND (sender=${recipient.id} OR recipient=${recipient.id})) AS connected,(SELECT count(*)::int FROM connections WHERE event=${m.event} AND recipient=${recipient.id} AND status='pending') AS requests,(SELECT COALESCE(jsonb_agg(r.name),'[]'::jsonb) FROM (SELECT p.data->>'name' AS name FROM connections c JOIN profiles p ON p.id=c.sender WHERE c.event=${m.event} AND c.recipient=${recipient.id} AND c.status='pending' ORDER BY c.created DESC LIMIT 3) r) AS requesters`
      )[0];
      Object.assign(m.data, stats);
    }
    const cls = mailClass(m.kind);
    const rec = cls === "match" ? 1 : 0;
    const note = cls === "notice" ? 1 : 0;
    // Sender-wide budget first (sign-in codes may use the reserve), then the person's.
    const senderOk =
      await sql`INSERT INTO daily_mail(email,day,total) VALUES(${SENDER},${day},1) ON CONFLICT(email,day) DO UPDATE SET total=daily_mail.total+1 WHERE daily_mail.total<${auth ? lim.cap : lim.softCap} RETURNING total`;
    let allowed = senderOk;
    if (senderOk.length) {
      allowed =
        await sql`INSERT INTO daily_mail(email,day,total,recommendations,notices) VALUES(${m.email},${day},1,${rec},${note}) ON CONFLICT(email,day) DO UPDATE SET total=daily_mail.total+1,recommendations=daily_mail.recommendations+${rec},notices=daily_mail.notices+${note} WHERE CASE WHEN ${cls}::text='match' THEN daily_mail.recommendations<${MATCH_PER_DAY} WHEN ${cls}::text='notice' THEN daily_mail.notices<${NOTICES_PER_DAY} AND daily_mail.total-daily_mail.recommendations<${ESSENTIAL_PER_DAY} ELSE daily_mail.total-daily_mail.recommendations<${ESSENTIAL_PER_DAY} END RETURNING total`;
      if (!allowed.length)
        await sql`UPDATE daily_mail SET total=total-1 WHERE email=${SENDER} AND day=${day}`;
    }
    if (!allowed.length) {
      await sql`UPDATE mail_queue SET state='pending' WHERE id=${m.id}`;
      continue;
    }
    try {
      const origin = process.env.APP_URL;
      if (!origin) throw Error("APP_URL missing");
      const base = `${origin}/e/${m.event}`;
      const token =
        auth || m.kind === "welcome" || m.kind === "match"
          ? ""
          : await createToken(
              m.email,
              m.event,
              m.kind === "create" ? "create" : "access",
              m.kind === "create" ? m.data : {},
            );
      const url =
        m.kind === "admin-code"
          ? `${origin}/admin`
          : token
            ? `${origin}/api/link?token=${token}`
            : `${base}/connections`;
      let title = "",
        body = "",
        label = "Open your event";
      let unsubscribe: string | undefined;
      if (m.kind === "admin-code") {
        if (m.email !== adminEmail()) throw Error("Invalid admin recipient");
        const code = await issueAdminCode();
        title = "Your RoomRoster sign-in code";
        body = `<p>Enter this code in RoomRoster to open your admin dashboard:</p><p style="font-size:32px;letter-spacing:8px;font-weight:bold">${code}</p><p>This code expires in 10 minutes and works once. If you did not request it, you can ignore this email.</p>`;
        label = "Open admin sign-in";
      } else if (m.kind === "welcome" || m.kind === "participant-code") {
        const code = await issueParticipantCode(m.event, m.email);
        title =
          m.kind === "welcome"
            ? `Welcome to ${ev.name} — your sign-in code`
            : `Your sign-in code for ${ev.name}`;
        body = `${m.kind === "welcome" ? `<p>Hi ${h(m.data.name)}, your profile is ready.</p>` : ""}<p>Enter this code in RoomRoster to sign in:</p><p style="font-size:32px;letter-spacing:8px;font-weight:bold">${code}</p><p>Valid for 10 minutes, once. If you didn’t request this, ignore this email.</p>`;
        label = "Open my event";
      } else if (m.kind === "access") {
        title = `Your link to ${ev.name}`;
        body =
          "<p>Use this secure link to return to your profile. It expires in 24 hours and can be used once.</p>";
        label = "Return to my profile";
      } else if (m.kind === "create") {
        title = "Your new room is almost ready";
        body = `<p>Confirm your email to create ${h(m.data.name)} and manage its directory.</p>`;
        label = "Confirm & create my event";
      } else if (m.kind === "connection") {
        title = `${String(m.data.name || "Someone").slice(0, 80)} wants to connect on ${ev.name}`;
        body = `<p>${h(m.data.name)} would like to connect with you.</p>${m.data.message ? `<p style="border-left:3px solid #8e8270;padding-left:12px"><em>Their note:</em><br>${h(m.data.message)}</p>` : ""}<p>Review their profile and accept if you’d like to share contact details. Nothing is shared until you accept.</p>`;
        label = "Review connection request";
      } else if (m.kind === "accepted") {
        title = `${String(m.data.name || "Someone").slice(0, 80)} accepted your request on ${ev.name}`;
        body = `<p>${h(m.data.name)} accepted your connection request.</p><p>Open your connections to see the contact details they chose to share.</p>`;
        label = "Open my connections";
      } else {
        title = `Your update from ${ev.name}`;
        body = `<p><strong>${h(ev.name)}</strong> now has ${Number(m.data.total)} participants.</p><p>Since your last update, <strong>${Number(m.data.count)} new ${Number(m.data.count) === 1 ? "person" : "people"}</strong> joined this event’s directory.</p><p>You have ${Number(m.data.connected)} accepted connections and ${Number(m.data.requests)} pending requests.</p>${m.data.requesters?.length ? `<p>${m.data.requesters.map((name: string) => h(name)).join(", ")} would like to connect. <a href="${h(base + "/connections")}">Review requests</a>.</p>` : ""}${m.data.matches.length ? `<p>A few people who may help with what you need:</p><ul>${m.data.matches.map((p: any) => `<li><a href="${h(base + "/people/" + p.id)}">${h(p.name)}</a> — ${h(p.reason)}</li>`).join("")}</ul>` : "<p>No new matches this time. Explore the room or update what you’re looking for.</p>"}`;
        label = "Meet your suggested people";
        const opt = await createToken(
          m.email,
          m.event,
          "unsubscribe",
          {},
          24 * 365,
        );
        unsubscribe = `${origin}/api/link?token=${opt}`;
      }
      await transport.sendMail({
        from: { name: "RoomRoster", address: process.env.SMTP_USER },
        replyTo: process.env.ORGANIZER_EMAIL || "roomroster07@gmail.com",
        to: m.email,
        subject: title.replace(/[\r\n]/g, " "),
        html: emailTemplate(title, body, url, label, unsubscribe),
        text: `${title}\n\n${body.replace(/<[^>]*>/g, " ")}\n\n${label}: ${url}${unsubscribe ? "\nTurn off match updates: " + unsubscribe : ""}`,
      });
      await sql`UPDATE mail_queue SET state='sent' WHERE id=${m.id}`;
      if (m.kind === "match") {
        await sql`INSERT INTO match_updates(profile,candidate) SELECT ${m.data.profile}::uuid,id FROM profiles WHERE id=ANY(${m.data.matches.map((p: any) => p.id)}::uuid[]) ON CONFLICT DO NOTHING`;
        await sql`INSERT INTO digest_cursor(profile,seen) VALUES(${m.data.profile},${m.data.until}) ON CONFLICT(profile) DO UPDATE SET seen=EXCLUDED.seen`;
      }
      sent++;
    } catch (error) {
      console.error("RoomRoster SMTP failure", safeMailFailure(error));
      await sql`UPDATE mail_queue SET state='failed' WHERE id=${m.id}`; /* Keep reservation: SMTP outcome may be ambiguous; never retry automatically. */
    }
  }
  return { sent, configured: true };
}
