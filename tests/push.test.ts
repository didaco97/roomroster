import {
  beforeAll,
  beforeEach,
  afterAll,
  describe,
  it,
  expect,
  vi,
} from "vitest";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { createECDH, randomBytes } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { eventDefault, blankProfile } from "../src/domain";

const require = createRequire(import.meta.url);
const ece = require("http_ece");

const state = vi.hoisted(() => ({
  pg: null as any,
  pushes: [] as { endpoint: string; headers: any; body: Buffer }[],
  pushStatus: 201,
}));
vi.mock("nodemailer", () => ({
  default: {
    createTransport: () => ({
      sendMail: async (mail: any) => ({ accepted: [mail.to] }),
    }),
  },
}));
vi.mock("../server/db", () => ({
  db:
    () =>
    async (strings: TemplateStringsArray, ...args: unknown[]) => {
      let q = strings[0];
      for (let i = 0; i < args.length; i++) q += `$${i + 1}` + strings[i + 1];
      return (await state.pg.query(q, args)).rows;
    },
}));

import handler from "../netlify/functions/api";
import {
  encryptPayload,
  encryptPayloadRecord,
  sendPushToProfile,
} from "../server/push";
import { createToken } from "../server/security";

const event = eventDefault.slug;
const b64u = (b: Buffer | Uint8Array) =>
  Buffer.from(b).toString("base64url");
const ub64u = (s: string) => Buffer.from(s, "base64url");

// A throwaway VAPID pair for the test run (raw scalar + uncompressed point).
const vapidECDH = createECDH("prime256v1");
vapidECDH.generateKeys();
process.env.VAPID_PUBLIC_KEY = b64u(vapidECDH.getPublicKey(null, "uncompressed"));
process.env.VAPID_PRIVATE_KEY = b64u(vapidECDH.getPrivateKey());
process.env.APP_URL = "http://localhost:8888";
process.env.SESSION_SECRET = "a".repeat(40);
process.env.SMTP_USER = "roomroster07@gmail.com";
process.env.SMTP_PASS = "test-not-real";

function subscriber() {
  const ecdh = createECDH("prime256v1");
  ecdh.generateKeys();
  return {
    ecdh,
    p256dh: b64u(ecdh.getPublicKey(null, "uncompressed")),
    auth: b64u(randomBytes(16)),
    endpoint: "https://push.example.test/" + randomBytes(8).toString("hex"),
  };
}

async function call(action: string, body: object = {}, cookie = "") {
  return handler(
    new Request("http://localhost:8888/api/" + action, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "http://localhost:8888",
        ...(cookie ? { cookie } : {}),
        "x-nf-client-connection-ip": "127.0.0.1",
      },
      body: JSON.stringify({ event, ...body }),
    }),
  );
}
async function register(email: string, name = "Test person") {
  const r = await call("register", {
    profile: {
      ...blankProfile(),
      name,
      email,
      startup: "Farm Lab",
      bio: "Testing agricultural tools",
      location: "Pune",
    },
  });
  expect(r.status).toBe(200);
  return (
    await state.pg.query("SELECT * FROM profiles WHERE email=$1", [email])
  ).rows[0];
}
async function session(email: string) {
  const token = await createToken(email, event, "access");
  const r = await handler(
    new Request(`http://localhost:8888/api/link?token=${token}`, {
      method: "POST",
    }),
  );
  expect(r.status).toBe(303);
  return r.headers.get("set-cookie")!.split(";")[0];
}

beforeAll(async () => {
  state.pg = new PGlite();
  await state.pg.exec(
    await readFile(new URL("../server/schema.sql", import.meta.url), "utf8"),
  );
  vi.stubGlobal("fetch", async (url: any, init: any) => {
    state.pushes.push({
      endpoint: String(url),
      headers: init.headers,
      body: Buffer.from(init.body),
    });
    return new Response("", { status: state.pushStatus });
  });
});
beforeEach(async () => {
  state.pushes = [];
  state.pushStatus = 201;
  await state.pg.exec(
    "TRUNCATE events,profiles,connections,tokens,sessions,admin_sessions,admin_codes,participant_codes,digest_jobs,limits,daily_mail,mail_queue,match_updates,digest_cursor,search_cache,push_subscriptions CASCADE",
  );
  await state.pg.query("INSERT INTO events VALUES($1,$2,$3)", [
    event,
    "roomroster07@gmail.com",
    JSON.stringify(eventDefault),
  ]);
});
afterAll(async () => {
  await state.pg.close();
  vi.unstubAllGlobals();
});

describe("RFC 8291 payload encryption", () => {
  it("reproduces the RFC 8291 worked example exactly", async () => {
    // Section 5 + Appendix A vectors.
    const uaPub =
      "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4";
    const auth = "BTBZMqHH6r4Tts7J_aSIgg";
    const asPub = ub64u(
      "BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8",
    );
    const asPriv = await crypto.subtle.importKey(
      "jwk",
      {
        kty: "EC",
        crv: "P-256",
        d: "yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw",
        x: b64u(asPub.subarray(1, 33)),
        y: b64u(asPub.subarray(33, 65)),
      },
      { name: "ECDH", namedCurve: "P-256" },
      false,
      ["deriveBits"],
    );
    const salt = ub64u("DGv6ra1nlYgDCS1FRnbzlw");
    const out = await encryptPayloadRecord(
      asPriv,
      asPub,
      salt,
      uaPub,
      auth,
      "When I grow up, I want to be a watermelon",
    );
    expect(b64u(out)).toBe(
      "DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN",
    );
  });

  it("round-trips through an independent implementation (http_ece)", async () => {
    const sub = subscriber();
    const body = await encryptPayload(sub.p256dh, sub.auth, "hello roster");
    const plain = ece.decrypt(Buffer.from(body), {
      version: "aes128gcm",
      privateKey: sub.ecdh,
      authSecret: ub64u(sub.auth),
    });
    expect(plain.toString()).toBe("hello roster");
  });
});

describe("push subscription API", () => {
  it("serves the VAPID key, stores a subscription, refreshes it, removes it", async () => {
    await register("push1@example.com", "Push One");
    const cookie = await session("push1@example.com");
    const keyRes = await call("push-key", {}, cookie);
    expect(keyRes.status).toBe(200);
    expect((await keyRes.json()).key).toBe(process.env.VAPID_PUBLIC_KEY);

    const sub = subscriber();
    const r1 = await call(
      "push-subscribe",
      { subscription: { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } } },
      cookie,
    );
    expect(r1.status).toBe(200);
    let rows = (await state.pg.query("SELECT * FROM push_subscriptions")).rows;
    expect(rows).toHaveLength(1);
    expect(rows[0].p256dh).toBe(sub.p256dh);

    // Same endpoint again: one row, updated in place.
    const r2 = await call(
      "push-subscribe",
      { subscription: { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } } },
      cookie,
    );
    expect(r2.status).toBe(200);
    rows = (await state.pg.query("SELECT * FROM push_subscriptions")).rows;
    expect(rows).toHaveLength(1);

    const r3 = await call(
      "push-unsubscribe",
      { subscription: { endpoint: sub.endpoint } },
      cookie,
    );
    expect(r3.status).toBe(200);
    rows = (await state.pg.query("SELECT * FROM push_subscriptions")).rows;
    expect(rows).toHaveLength(0);
  });

  it("rejects subscribe without sign-in and non-HTTPS endpoints", async () => {
    const sub = subscriber();
    const anon = await call("push-subscribe", {
      subscription: { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
    });
    expect(anon.status).toBe(401);
    await register("push2@example.com");
    const cookie = await session("push2@example.com");
    const bad = await call(
      "push-subscribe",
      { subscription: { endpoint: "http://insecure.example/x", keys: { p256dh: sub.p256dh, auth: sub.auth } } },
      cookie,
    );
    expect(bad.status).toBe(400);
  });
});

describe("push delivery", () => {
  it("sends a VAPID-signed aes128gcm request the subscriber can decrypt", async () => {
    const sub = subscriber();
    const p = await register("push3@example.com", "Push Three");
    await state.pg.query(
      "INSERT INTO push_subscriptions VALUES($1,$2,$3,$4,now())",
      [sub.endpoint, p.id, sub.p256dh, sub.auth],
    );
    const result = await sendPushToProfile(p.id, {
      title: "Someone wants to connect",
      body: "Open RoomRoster",
      url: "/e/x/connections",
    });
    expect(result).toEqual({ sent: 1, configured: true });
    expect(state.pushes).toHaveLength(1);
    const push = state.pushes[0];
    expect(push.endpoint).toBe(sub.endpoint);
    expect(push.headers["Content-Encoding"]).toBe("aes128gcm");

    // VAPID: JWT verifies against the announced public key.
    const authHeader: string = push.headers.Authorization;
    const m = authHeader.match(/^vapid t=([^,]+), k=(.+)$/);
    expect(m).toBeTruthy();
    const [, jwt, k] = m!;
    expect(k).toBe(process.env.VAPID_PUBLIC_KEY);
    const [h, c, sig] = jwt.split(".");
    expect(JSON.parse(ub64u(c).toString()).aud).toBe(
      "https://push.example.test",
    );
    const verifyKey = await crypto.subtle.importKey(
      "raw",
      ub64u(process.env.VAPID_PUBLIC_KEY!) as BufferSource,
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["verify"],
    );
    const ok = await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      verifyKey,
      ub64u(sig) as BufferSource,
      new TextEncoder().encode(`${h}.${c}`) as BufferSource,
    );
    expect(ok).toBe(true);

    // The subscriber decrypts the payload.
    const plain = ece.decrypt(push.body, {
      version: "aes128gcm",
      privateKey: sub.ecdh,
      authSecret: ub64u(sub.auth),
    });
    expect(JSON.parse(plain.toString())).toEqual({
      title: "Someone wants to connect",
      body: "Open RoomRoster",
      url: "/e/x/connections",
    });
  });

  it("forgets subscriptions the push service reports gone", async () => {
    const sub = subscriber();
    const p = await register("push4@example.com");
    await state.pg.query(
      "INSERT INTO push_subscriptions VALUES($1,$2,$3,$4,now())",
      [sub.endpoint, p.id, sub.p256dh, sub.auth],
    );
    state.pushStatus = 410;
    const result = await sendPushToProfile(p.id, {
      title: "t",
      body: "b",
      url: "/",
    });
    expect(result.sent).toBe(0);
    expect(
      (await state.pg.query("SELECT * FROM push_subscriptions")).rows,
    ).toHaveLength(0);
  });

  it("pushes the recipient on a new request and the requester on accept", async () => {
    const recipientSub = subscriber();
    const senderSub = subscriber();
    const recipient = await register("to@example.com", "Recipient");
    const sender = await register("from@example.com", "Sender");
    await state.pg.query("UPDATE profiles SET verified=true");
    await state.pg.query(
      "INSERT INTO push_subscriptions VALUES($1,$2,$3,$4,now())",
      [recipientSub.endpoint, recipient.id, recipientSub.p256dh, recipientSub.auth],
    );
    await state.pg.query(
      "INSERT INTO push_subscriptions VALUES($1,$2,$3,$4,now())",
      [senderSub.endpoint, sender.id, senderSub.p256dh, senderSub.auth],
    );
    const senderCookie = await session("from@example.com");
    const conn = await call("connect", { to: recipient.id }, senderCookie);
    expect(conn.status).toBe(200);
    expect(state.pushes).toHaveLength(1);
    expect(state.pushes[0].endpoint).toBe(recipientSub.endpoint);
    const reqPayload = JSON.parse(
      ece
        .decrypt(state.pushes[0].body, {
          version: "aes128gcm",
          privateKey: recipientSub.ecdh,
          authSecret: ub64u(recipientSub.auth),
        })
        .toString(),
    );
    expect(reqPayload.title).toBe("Sender wants to connect");

    const connection = (
      await state.pg.query("SELECT id FROM connections")
    ).rows[0];
    const recipientCookie = await session("to@example.com");
    const acc = await call(
      "respond",
      { id: connection.id, accept: true },
      recipientCookie,
    );
    expect(acc.status).toBe(200);
    expect(state.pushes).toHaveLength(2);
    expect(state.pushes[1].endpoint).toBe(senderSub.endpoint);
    const accPayload = JSON.parse(
      ece
        .decrypt(state.pushes[1].body, {
          version: "aes128gcm",
          privateKey: senderSub.ecdh,
          authSecret: ub64u(senderSub.auth),
        })
        .toString(),
    );
    expect(accPayload.title).toBe("Recipient accepted your request");
    expect(JSON.stringify(accPayload)).not.toMatch(/@|phone/i);
  });
});
