// Firebase Cloud Messaging (HTTP v1) for the native Android app.
// Auth: service-account JWT (RS256) exchanged for an OAuth2 access token,
// implemented on Web Crypto so it runs on Cloudflare Workers and in Node.
// Message payloads mirror web push: title, short body, relative URL only -
// never phone numbers or email addresses.
import { db } from "./db";
import { ensureFcmTokens } from "./upgrade";

const te = new TextEncoder();

function b64u(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

interface ServiceAccount {
  client_email: string;
  private_key: string;
  project_id: string;
}

function serviceAccount(): ServiceAccount | null {
  const raw = process.env.FCM_SERVICE_ACCOUNT;
  if (!raw || raw.length < 100) return null;
  try {
    const sa = JSON.parse(raw) as ServiceAccount;
    if (!sa.client_email || !sa.private_key || !sa.project_id) return null;
    return sa;
  } catch {
    return null;
  }
}

export function fcmConfigured(): boolean {
  return serviceAccount() !== null;
}

async function importKey(pkcs8Pem: string): Promise<CryptoKey> {
  const der = Uint8Array.from(
    atob(pkcs8Pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "")),
    (c) => c.charCodeAt(0),
  );
  return crypto.subtle.importKey(
    "pkcs8",
    der.buffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

let cachedToken: { token: string; exp: number } | undefined;

async function accessToken(sa: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.exp > now + 60) return cachedToken.token;
  const key = await importKey(sa.private_key);
  const header = b64u(te.encode(JSON.stringify({ alg: "RS256", typ: "JWT" })));
  const claims = b64u(
    te.encode(
      JSON.stringify({
        iss: sa.client_email,
        scope: "https://www.googleapis.com/auth/firebase.messaging",
        aud: "https://oauth2.googleapis.com/token",
        iat: now,
        exp: now + 3600,
      }),
    ),
  );
  const sig = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    te.encode(`${header}.${claims}`),
  );
  const jwt = `${header}.${claims}.${b64u(sig)}`;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });
  if (!res.ok) throw new Error(`FCM token exchange failed (${res.status})`);
  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { token: data.access_token, exp: now + (data.expires_in || 3600) };
  return cachedToken.token;
}

async function sendToToken(
  sa: ServiceAccount,
  oauth: string,
  token: string,
  payload: { title: string; body: string; url: string },
): Promise<"ok" | "gone" | "error"> {
  const res = await fetch(
    `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${oauth}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        message: {
          token,
          data: { title: payload.title, body: payload.body, url: payload.url },
          android: { priority: "HIGH" },
        },
      }),
    },
  );
  if (res.ok) return "ok";
  const text = await res.text();
  if (res.status === 404 || /UNREGISTERED|NOT_FOUND/.test(text)) return "gone";
  console.error("RoomRoster FCM send failed", res.status);
  return "error";
}

export async function sendFcmToProfile(
  profileId: string,
  payload: { title: string; body: string; url: string },
): Promise<void> {
  const sa = serviceAccount();
  if (!sa) return;
  const sql = db();
  await ensureFcmTokens();
  const rows = await sql`SELECT token FROM fcm_tokens WHERE profile=${profileId}::uuid`;
  if (rows.length === 0) return;
  const oauth = await accessToken(sa);
  for (const row of rows) {
    const token = row.token as string;
    const result = await sendToToken(sa, oauth, token, payload);
    if (result === "gone")
      await sql`DELETE FROM fcm_tokens WHERE token=${token}`;
  }
}

export async function fcmNotify(
  email: string,
  event: string,
  kind: "connection" | "accepted",
  data: { name: string },
): Promise<void> {
  try {
    const sql = db();
    const p = (
      await sql`SELECT id FROM profiles WHERE event=${event} AND email=${email}`
    )[0];
    if (!p) return;
    const url = `/e/${encodeURIComponent(event)}/connections`;
    const payload =
      kind === "connection"
        ? {
            title: `${data.name} wants to connect`,
            body: "Open RoomRoster to review the request. Nothing is shared until you accept.",
            url,
          }
        : {
            title: `${data.name} accepted your request`,
            body: "Open your connections to see the contact details they chose to share.",
            url,
          };
    await sendFcmToProfile(p.id, payload);
  } catch {
    console.error("RoomRoster FCM notify failed", kind);
  }
}
