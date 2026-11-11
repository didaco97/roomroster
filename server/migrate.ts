import { readFile } from "node:fs/promises";
import { db } from "./db";
import { eventDefault } from "../src/domain";
const sql = db();
for (const statement of (
  await readFile(new URL("./schema.sql", import.meta.url), "utf8")
)
  .split(";")
  .filter((s) => s.trim()))
  await sql.query(statement);
await sql`INSERT INTO events(slug,owner,data) VALUES(${eventDefault.slug},${process.env.ORGANIZER_EMAIL || "roomroster07@gmail.com"},${JSON.stringify(eventDefault)}::jsonb) ON CONFLICT DO NOTHING`;
console.log("Schema ready; default event created without sample participants.");
