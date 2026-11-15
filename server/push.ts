// Web Push (RFC 8291 payload encryption + RFC 8292 VAPID) implemented on
// Web Crypto so it runs unchanged on Cloudflare Workers and in Node for tests.
// Push never carries phone numbers or email addresses; it carries a title,
// a short body and a relative URL to open.
import { db } from "./db";
import { ensurePushSubscriptions } from "./upgrade";

const te = new TextEncoder();

function b64u(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function ub64u(s: string): Uint8Array {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

export function pushPublicKey(): string | null {
  const k = process.env.VAPID_PUBLIC_KEY;
  return k && k.length > 10 ? k : null;
}

// Wrap a raw 32-byte P-256 scalar in a PKCS#8 envelope (prime256v1, no public
// part; matches openssl pkcs8 output) so Web Crypto can import it for signing.
function pkcs8(scalar: Uint8Array, pub: Uint8Array): Uint8Array {
  if (scalar.length !== 32 || pub.length !== 65)
    throw Error("Bad VAPID key material");
  // PKCS#8, P-256 (prime256v1) with public key (matches openssl/Node export):
  // 30 81 87 02 01 00 30 13 06 07 2a8648ce3d0201 06 08 2a8648ce3d030107
  // 04 6d 30 6b 02 01 01 04 20 <scalar> a1 44 03 42 00 <public point>
  const prefix = Uint8Array.of(
    0x30, 0x81, 0x87, 0x02, 0x01, 0x00, 0x30, 0x13, 0x06, 0x07, 0x2a, 0x86,
    0x48, 0xce, 0x3d, 0x02, 0x01, 0x06, 0x08, 0x2a, 0x86, 0x48, 0xce, 0x3d,
    0x03, 0x01, 0x07, 0x04, 0x6d, 0x30, 0x6b, 0x02, 0x01, 0x01, 0x04, 0x20,
  );
  const suffix = Uint8Array.of(0xa1, 0x44, 0x03, 0x42, 0x00);
  return concat(prefix, scalar, suffix, pub);
}

async function vapidJwt(endpoint: string, pub: string, priv: string) {
  const aud = new URL(endpoint).origin;
  const header = b64u(te.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const now = Math.floor(Date.now() / 1000);
  const claims = b64u(
    te.encode(
      JSON.stringify({
        aud,
        exp: now + 12 * 3600,
        sub: process.env.VAPID_SUBJECT || "mailto:roomroster07@gmail.com",
      }),
    ),
  );
  const unsigned = `${header}.${claims}`;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pkcs8(ub64u(priv), ub64u(pub)) as BufferSource,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    te.encode(unsigned) as BufferSource,
  );
  return `${unsigned}.${b64u(sig)}`;
}

async function hmac(keyBytes: Uint8Array, data: Uint8Array) {
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes as BufferSource,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return new Uint8Array(
    await crypto.subtle.sign("HMAC", key, data as BufferSource),
  );
}

// RFC 8291: ECDH with the subscriber key, then RFC 8188 aes128gcm content coding.
export async function encryptPayload(
  p256dh: string,
  auth: string,
  payload: string,
): Promise<Uint8Array> {
  const asKeys = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"],
  );
  const asPub = new Uint8Array(
    await crypto.subtle.exportKey("raw", asKeys.publicKey),
  );
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return encryptPayloadRecord(asKeys.privateKey, asPub, salt, p256dh, auth, payload);
}

// Exported for the RFC 8291 worked-example test: encryption with a chosen
// ephemeral key and salt is otherwise internal.
export async function encryptPayloadRecord(
  asPrivate: CryptoKey,
  asPub: Uint8Array,
  salt: Uint8Array,
  p256dh: string,
  auth: string,
  payload: string,
): Promise<Uint8Array> {
  const uaPub = ub64u(p256dh);
  const authSecret = ub64u(auth);
  const subKey = await crypto.subtle.importKey(
    "raw",
    uaPub as BufferSource,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );
  const shared = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: "ECDH", public: subKey },
      asPrivate,
      256,
    ),
  );
  // RFC 8291 3.4: HKDF-Expand includes the 0x01 counter block.
  const prkKey = await hmac(authSecret, shared);
  const ikm = await hmac(
    prkKey,
    concat(te.encode("WebPush: info\0"), uaPub, asPub, Uint8Array.of(1)),
  );
  const prk = await hmac(salt, ikm);
  const cek = (
    await hmac(prk, concat(te.encode("Content-Encoding: aes128gcm\0"), Uint8Array.of(1)))
  ).slice(0, 16);
  const nonce = (
    await hmac(prk, concat(te.encode("Content-Encoding: nonce\0"), Uint8Array.of(1)))
  ).slice(0, 12);
  const padded = concat(te.encode(payload), Uint8Array.of(2));
  const aes = await crypto.subtle.importKey("raw", cek as BufferSource, "AES-GCM", false, [
    "encrypt",
  ]);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: nonce as BufferSource },
      aes,
      padded as BufferSource,
    ),
  );
  // record size 4096, one record: salt | rs | keyid length | sender public | ciphertext
  return concat(salt, Uint8Array.of(0, 0, 16, 0), Uint8Array.of(65), asPub, ciphertext);
}

export type PushPayload = { title: string; body: string; url: string };

// One delivery attempt to one subscription. Returns the push service status.
export async function deliver(
  endpoint: string,
  p256dh: string,
  auth: string,
  payload: PushPayload,
  pub: string,
  priv: string,
): Promise<number> {
  const jwt = await vapidJwt(endpoint, pub, priv);
  const body = await encryptPayload(p256dh, auth, JSON.stringify(payload));
  const r = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `vapid t=${jwt}, k=${pub}`,
      "Content-Encoding": "aes128gcm",
      TTL: "86400",
    },
    body: body as BodyInit,
  });
  return r.status;
}

export async function sendPushToProfile(
  profile: string,
  payload: PushPayload,
): Promise<{ sent: number; configured: boolean }> {
  const pub = pushPublicKey();
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return { sent: 0, configured: false };
  await ensurePushSubscriptions();
  const sql = db();
  const subs =
    await sql`SELECT endpoint,p256dh,auth FROM push_subscriptions WHERE profile=${profile}::uuid`;
  let sent = 0;
  for (const s of subs) {
    try {
      const status = await deliver(
        s.endpoint,
        s.p256dh,
        s.auth,
        payload,
        pub,
        priv,
      );
      const r = { status };
      if (r.status === 404 || r.status === 410) {
        // The browser dropped this subscription; forget it.
        await sql`DELETE FROM push_subscriptions WHERE endpoint=${s.endpoint}`;
      } else if (r.status >= 200 && r.status < 300) {
        sent++;
      } else {
        console.error("RoomRoster push rejected", r.status);
      }
    } catch {
      console.error("RoomRoster push send failed");
    }
  }
  return { sent, configured: true };
}

// Mirror of the email notice, without contact details. Never throws.
export async function pushNotify(
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
    await sendPushToProfile(p.id, payload);
  } catch {
    console.error("RoomRoster push notify failed", kind);
  }
}
