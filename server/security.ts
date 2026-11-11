import { createHash, randomBytes, createHmac } from "node:crypto";
import { z } from "zod";
import { db } from "./db";
import { sectors, roles } from "../src/domain";
export const hash = (s: string) => createHash("sha256").update(s).digest("hex");
export const opaque = () => randomBytes(32).toString("base64url");
export const escapeHtml = (s: string) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
const text = (max: number) => z.string().trim().max(max);
const url = z.union([
  z.literal(""),
  z
    .url()
    .max(500)
    .refine((s) => /^https?:\/\//i.test(s), "Use an http or https URL."),
]);
export const emailSchema = z
  .email()
  .max(254)
  .transform((s) => s.toLowerCase());
export const profileSchema = z.object({
  name: text(70).min(1),
  email: emailSchema,
  phone: text(30).regex(/^[+\d\s()\-]*$/),
  startup: text(100).min(1),
  bio: text(240).min(1),
  location: text(100).min(1),
  sector: z.enum(sectors.slice(1) as [string, ...string[]]),
  needs: z.array(z.enum(roles as [string, ...string[]])).max(14),
  offers: z.array(z.enum(roles as [string, ...string[]])).max(14),
  needText: text(800),
  offerText: text(800),
  website: url,
  linkedin: url.refine(
    (s) => !s || /^https:\/\/(www\.)?linkedin\.com\/in\//i.test(s),
    "Use a LinkedIn profile URL.",
  ),
  photo: z
    .string()
    .max(180000)
    .refine(
      (s) =>
        !s || /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(s),
      "Invalid image.",
    ),
  alerts: z.boolean(),
  aiConsent: z.boolean(),
});
export const eventSchema = z
  .object({
    name: text(100).min(1),
    subtitle: text(180).min(1),
    description: text(1200).min(1),
    location: text(100).min(1),
    start: z.iso.date(),
    end: z.iso.date(),
    closed: z.boolean().optional(),
  })
  .refine((e) => e.end >= e.start, "End date must follow start date.");
export async function rate(key: string, max: number, minutes = 60) {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32)
    throw Error("Set SESSION_SECRET to at least 32 random characters.");
  const bucket = Math.floor(Date.now() / (minutes * 60000));
  const id = createHmac("sha256", secret)
    .update(key + bucket)
    .digest("hex");
  const sql = db();
  const rows =
    await sql`INSERT INTO limits(key,count) VALUES(${id},1) ON CONFLICT(key) DO UPDATE SET count=limits.count+1 RETURNING count`;
  if (rows[0].count > max)
    throw Object.assign(Error("Please wait a little before trying again."), {
      status: 429,
    });
}
export async function identity(req: Request) {
  const token = req.headers
    .get("cookie")
    ?.match(/(?:^|;\s*)rr_session=([^;]+)/)?.[1];
  if (!token) return null;
  const sql = db();
  const rows =
    await sql`SELECT email FROM sessions WHERE hash=${hash(token)} AND expires>now()`;
  return (rows[0]?.email as string) || null;
}
export async function createToken(
  email: string,
  event: string,
  kind: string,
  data: object = {},
  hours = 24,
) {
  const raw = opaque();
  const sql = db();
  await sql`INSERT INTO tokens(hash,email,event,kind,data,expires) VALUES(${hash(raw)},${email},${event},${kind},${JSON.stringify(data)}::jsonb,${new Date(Date.now() + hours * 3600000).toISOString()})`;
  return raw;
}
export function publicProfile(row: any) {
  return {
    ...row.data,
    id: row.id,
    event: row.event,
    joined: new Date(row.joined).toISOString(),
  };
}
