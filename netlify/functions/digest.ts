// Dispatch separately so matching and delivery can use Netlify's background runtime.
export default async function handler() {
  if (!process.env.APP_URL || !process.env.SESSION_SECRET)
    throw Error("Configure APP_URL and SESSION_SECRET.");
  const response = await fetch(
    `${process.env.APP_URL}/.netlify/functions/digest-background`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.SESSION_SECRET}` },
      signal: AbortSignal.timeout(10000),
    },
  );
  if (!response.ok) throw Error("Digest dispatch failed.");
  return new Response("Digest dispatched.");
}
export const config = { schedule: "30 5,11 * * *" };
