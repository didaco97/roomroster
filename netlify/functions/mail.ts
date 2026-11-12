export default async function handler() {
  if (!process.env.APP_URL || !process.env.SESSION_SECRET)
    throw Error("Configure APP_URL and SESSION_SECRET.");
  const result = await fetch(
    `${process.env.APP_URL}/.netlify/functions/mail-background`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.SESSION_SECRET}` },
      signal: AbortSignal.timeout(10000),
    },
  );
  if (!result.ok) throw Error("Mail dispatch failed");
  return new Response("Mail dispatched");
}
export const config = { schedule: "* * * * *" };
