import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { db } from "./db";
import { hash, opaque } from "./security";
import { ensureParticipantCodes } from "./upgrade";

const codeHash = (event: string, email: string, code: string) => {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) throw Error("Session secret missing");
  return createHmac("sha256", secret)
    .update(`participant:${event}:${email}:${code}`)
    .digest("hex");
};

export async function issueParticipantCode(event: string, email: string) {
  await ensureParticipantCodes();
  const code = randomInt(0, 1000000).toString().padStart(6, "0");
  const sql = db();
  await sql`INSERT INTO participant_codes(event,email,hash,expires,attempts) VALUES(${event},${email},${codeHash(event, email, code)},now()+interval '10 minutes',0) ON CONFLICT(event,email) DO UPDATE SET hash=EXCLUDED.hash,expires=EXCLUDED.expires,attempts=0`;
  return code;
}

export async function consumeParticipantCode(
  event: string,
  email: string,
  code: unknown,
) {
  await ensureParticipantCodes();
  if (typeof code !== "string" || !/^\d{6}$/.test(code)) return false;
  const sql = db();
  const rows =
    await sql`UPDATE participant_codes SET attempts=attempts+1 WHERE event=${event} AND email=${email} AND expires>now() AND attempts<5 RETURNING hash`;
  if (
    !rows.length ||
    !timingSafeEqual(
      Buffer.from(rows[0].hash, "hex"),
      Buffer.from(codeHash(event, email, code), "hex"),
    )
  )
    return false;
  const used =
    await sql`DELETE FROM participant_codes WHERE event=${event} AND email=${email} AND hash=${rows[0].hash} RETURNING email`;
  return used.length > 0;
}

export async function participantCookie(email: string) {
  const raw = opaque();
  const sql = db();
  await sql`INSERT INTO sessions(hash,email,expires) VALUES(${hash(raw)},${email},now()+interval '30 days')`;
  return `rr_session=${raw}; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000${process.env.APP_URL?.startsWith("https:") ? "; Secure" : ""}`;
}
