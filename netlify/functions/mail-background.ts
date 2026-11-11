import { timingSafeEqual } from "node:crypto";
import { flush } from "../../server/mail";
export default async function handler(req: Request) {
  const expected = Buffer.from(`Bearer ${process.env.SESSION_SECRET || ""}`),
    received = Buffer.from(req.headers.get("authorization") || "");
  if (
    !process.env.SESSION_SECRET ||
    received.length !== expected.length ||
    !timingSafeEqual(received, expected)
  )
    return new Response("Unauthorized", { status: 401 });
  return new Response(JSON.stringify(await flush(50)));
}
