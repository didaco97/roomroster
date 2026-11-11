import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { db } from "./db";
import { hash, opaque } from "./security";
export const adminEmail = () =>
  (
    process.env.ADMIN_EMAIL ||
    process.env.ORGANIZER_EMAIL ||
    "roomroster07@gmail.com"
  ).toLowerCase();
const version = () => hash(adminEmail() + ":" + process.env.SESSION_SECRET);
const codeHash = (email: string, code: string) =>
  createHmac("sha256", process.env.SESSION_SECRET!)
    .update(email + ":" + code)
    .digest("hex");
export async function issueAdminCode() {
  if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32)
    throw Error("Session secret missing");
  const code = randomInt(0, 1000000).toString().padStart(6, "0");
  const sql = db();
  await sql`INSERT INTO admin_codes(email,hash,expires,attempts) VALUES(${adminEmail()},${codeHash(adminEmail(), code)},now()+interval '10 minutes',0) ON CONFLICT(email) DO UPDATE SET hash=EXCLUDED.hash,expires=EXCLUDED.expires,attempts=0`;
  return code;
}
export async function consumeAdminCode(email: unknown, code: unknown) {
  if (
    typeof email !== "string" ||
    email.trim().toLowerCase() !== adminEmail() ||
    typeof code !== "string" ||
    !/^\d{6}$/.test(code)
  )
    return false;
  const sql = db();
  const rows =
    await sql`UPDATE admin_codes SET attempts=attempts+1 WHERE email=${adminEmail()} AND expires>now() AND attempts<5 RETURNING hash`;
  if (!rows.length) return false;
  if (
    !timingSafeEqual(
      Buffer.from(rows[0].hash, "hex"),
      Buffer.from(codeHash(adminEmail(), code), "hex"),
    )
  )
    return false;
  const used =
    await sql`DELETE FROM admin_codes WHERE email=${adminEmail()} AND hash=${rows[0].hash} RETURNING email`;
  return used.length > 0;
}
export async function isPlatformAdmin(req: Request) {
  const raw = req.headers
    .get("cookie")
    ?.match(/(?:^|;\s*)rr_admin=([^;]+)/)?.[1];
  if (!raw || !process.env.SESSION_SECRET) return false;
  const sql = db();
  const rows =
    await sql`SELECT hash FROM admin_sessions WHERE hash=${hash(raw)} AND version=${version()} AND expires>now()`;
  return rows.length > 0;
}
export async function adminCookie() {
  const raw = opaque();
  const sql = db();
  await sql`INSERT INTO admin_sessions(hash,version,expires) VALUES(${hash(raw)},${version()},now()+interval '8 hours')`;
  return `rr_admin=${raw}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${process.env.APP_URL?.startsWith("https:") ? "; Secure" : ""}`;
}
