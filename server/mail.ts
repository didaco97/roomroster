import nodemailer from "nodemailer";
import { gmailTransportOptions, safeMailFailure } from "./smtp";
import { randomUUID } from "node:crypto";
import { db } from "./db";
import { createToken, escapeHtml as h } from "./security";
import { indiaDay } from "../src/domain";
import { issueAdminCode, adminEmail } from "./admin";
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
export async function flush(limit = 12, recipient: string | null = null) {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS)
    return { sent: 0, configured: false };
  const sql = db();
  const transport = nodemailer.createTransport(gmailTransportOptions());
  let sent = 0;
  for (let i = 0; i < limit; i++) {
    const day = indiaDay();
    const claimed =
      await sql`UPDATE mail_queue SET state='sending' WHERE id=(SELECT q.id FROM mail_queue q WHERE q.state='pending' AND (${recipient}::text IS NULL OR q.email=${recipient}) AND NOT EXISTS(SELECT 1 FROM daily_mail d WHERE d.email=q.email AND d.day=${day} AND (d.total>=3 OR (q.kind='match' AND d.recommendations>=2))) ORDER BY CASE WHEN q.kind='admin-code' THEN 0 WHEN q.kind='match' THEN 2 ELSE 1 END,q.created FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING *`;
    if (!claimed.length) break;
    const m = claimed[0];
    const ev = (await sql`SELECT data FROM events WHERE slug=${m.event}`)[0]
      ?.data;
    if (!ev) {
      await sql`UPDATE mail_queue SET state='cancelled' WHERE id=${m.id}`;
      continue;
    }
    if (m.kind === "match") {
      const recipient = (
        await sql`SELECT id,data,verified,joined FROM profiles WHERE event=${m.event} AND email=${m.email}`
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
          await sql`SELECT count(*) AS count FROM profiles WHERE event=${m.event} AND id<>${recipient.id} AND joined>${cursor} AND joined<=${m.data.until}`
        )[0].count,
      );
      const available =
        await sql`SELECT p.id FROM profiles p WHERE p.event=${m.event} AND NOT EXISTS(SELECT 1 FROM connections c WHERE (c.sender=${recipient.id} AND c.recipient=p.id) OR (c.recipient=${recipient.id} AND c.sender=p.id))`;
      m.data.matches = m.data.matches.filter((p: any) =>
        available.some((a) => a.id === p.id),
      );
      if (!m.data.matches.length) {
        await sql`UPDATE mail_queue SET state='cancelled' WHERE id=${m.id}`;
        continue;
      }
    }
    const rec = m.kind === "match" ? 1 : 0;
    const allowed =
      await sql`INSERT INTO daily_mail(email,day,total,recommendations) VALUES(${m.email},${day},1,${rec}) ON CONFLICT(email,day) DO UPDATE SET total=daily_mail.total+1,recommendations=daily_mail.recommendations+${rec} WHERE daily_mail.total<3 AND daily_mail.recommendations+${rec}<=2 RETURNING total`;
    if (!allowed.length) {
      await sql`UPDATE mail_queue SET state='pending' WHERE id=${m.id}`;
      continue;
    }
    try {
      const origin = process.env.APP_URL;
      if (!origin) throw Error("APP_URL missing");
      const base = `${origin}/e/${m.event}`;
      const token =
        m.kind === "admin-code"
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
          : `${origin}/api/link?token=${token}`;
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
      } else if (m.kind === "welcome") {
        title = `You’re in — ${ev.name}`;
        body = `<p>Hi ${h(m.data.name)}, your place in the directory is ready.</p><p>Confirm your email to start connecting and securely manage your profile.</p>`;
        label = "Confirm my email & explore";
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
        title = `A new hello in ${ev.name}`;
        body = `<p>${h(m.data.name)} would like to connect with you.</p><p>Review their profile and accept if you’d like to share contact details. Nothing is shared until you accept.</p>`;
        label = "Review connection request";
      } else {
        title = `People you may want to meet at ${ev.name}`;
        body = `<p>Since your last update, <strong>${Number(m.data.count)} new ${Number(m.data.count) === 1 ? "person" : "people"}</strong> joined this event’s directory.</p><p>These attendees may be able to help with what you’re looking for:</p><ul>${m.data.matches.map((p: any) => `<li><a href="${h(base + "/people/" + p.id)}">${h(p.name)}</a> — ${h(p.reason)}</li>`).join("")}</ul>`;
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
        for (const p of m.data.matches)
          await sql`INSERT INTO match_updates(profile,candidate) SELECT ${m.data.profile}::uuid,id FROM profiles WHERE id=${p.id}::uuid ON CONFLICT DO NOTHING`;
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
