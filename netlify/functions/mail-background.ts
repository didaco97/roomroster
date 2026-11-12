import { timingSafeEqual } from "node:crypto";
import { processDigests } from "../../server/digest";
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
  await processDigests(2);
  return new Response(JSON.stringify(await flush(2)));
}
