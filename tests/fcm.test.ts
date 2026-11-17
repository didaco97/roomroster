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
import { generateKeyPairSync, randomBytes } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { eventDefault, blankProfile } from "../src/domain";

const state = vi.hoisted(() => ({
  pg: null as any,
  fcmSends: [] as { url: string; headers: any; body: any }[],
  tokenExchanges: 0,
  fcmStatus: 200,
  fcmResponse: '{"name":"messages/1"}',
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

// Throwaway RSA service-account key for the test run only.
const saKeys = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});
process.env.FCM_SERVICE_ACCOUNT = JSON.stringify({
  client_email: "firebase-adminsdk-test@roomroster-test.iam.gserviceaccount.com",
  private_key: saKeys.privateKey,
  project_id: "roomroster-test",
});
process.env.APP_URL = "http://localhost:8888";
process.env.SESSION_SECRET = "a".repeat(40);
process.env.SMTP_USER = "roomroster07@gmail.com";
process.env.SMTP_PASS = "test-not-real";

import handler from "../netlify/functions/api";
import { fcmNotify } from "../server/fcm";
import { createToken } from "../server/security";

const event = eventDefault.slug;

function token() {
  return "fcm-" + randomBytes(60).toString("base64url") + ":APA91b" + randomBytes(20).toString("base64url");
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
  const t = await createToken(email, event, "access");
  const r = await handler(
    new Request(`http://localhost:8888/api/link?token=${t}`, {
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
    const u = String(url);
    if (u.includes("oauth2.googleapis.com/token")) {
      state.tokenExchanges++;
      return new Response(
        JSON.stringify({ access_token: "test-oauth-token", expires_in: 3600 }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    if (u.includes("fcm.googleapis.com")) {
      state.fcmSends.push({
        url: u,
        headers: init.headers,
        body: JSON.parse(init.body),
      });
      return new Response(state.fcmResponse, { status: state.fcmStatus });
    }
    return new Response("unexpected", { status: 500 });
  });
});
beforeEach(async () => {
  state.fcmSends = [];
  state.tokenExchanges = 0;
  state.fcmStatus = 200;
  state.fcmResponse = '{"name":"messages/1"}';
  await state.pg.exec(
    "TRUNCATE events,profiles,connections,tokens,sessions,admin_sessions,admin_codes,participant_codes,digest_jobs,limits,daily_mail,mail_queue,match_updates,digest_cursor,search_cache,push_subscriptions,fcm_tokens CASCADE",
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

describe("fcm-subscribe", () => {
  it("requires sign-in and a plausible token", async () => {
    const anon = await call("fcm-subscribe", { token: token() });
    expect(anon.status).toBe(401);

    await register("a@example.com");
    const cookie = await session("a@example.com");
    expect((await call("fcm-subscribe", { token: "short" }, cookie)).status).toBe(400);
    expect(
      (await call("fcm-subscribe", { token: "!" + "x".repeat(40) }, cookie)).status,
    ).toBe(400);
    expect((await call("fcm-subscribe", {}, cookie)).status).toBe(400);
  });

  it("associates a token with the signed-in profile and moves it on re-subscribe", async () => {
    const a = await register("a@example.com");
    const b = await register("b@example.com");
    const cookieA = await session("a@example.com");
    const cookieB = await session("b@example.com");
    const t = token();

    expect((await call("fcm-subscribe", { token: t }, cookieA)).status).toBe(200);
    let rows = (await state.pg.query("SELECT * FROM fcm_tokens")).rows;
    expect(rows).toHaveLength(1);
    expect(rows[0].profile).toBe(a.id);

    // Same device signs in as another profile: the token moves, no duplicate.
    expect((await call("fcm-subscribe", { token: t }, cookieB)).status).toBe(200);
    rows = (await state.pg.query("SELECT * FROM fcm_tokens")).rows;
    expect(rows).toHaveLength(1);
    expect(rows[0].profile).toBe(b.id);
  });

  it("unsubscribe removes only the owner's token", async () => {
    const a = await register("a@example.com");
    const b = await register("b@example.com");
    const cookieA = await session("a@example.com");
    const cookieB = await session("b@example.com");
    const ta = token();
    const tb = token();
    await call("fcm-subscribe", { token: ta }, cookieA);
    await call("fcm-subscribe", { token: tb }, cookieB);

    // B cannot remove A's token.
    expect((await call("fcm-unsubscribe", { token: ta }, cookieB)).status).toBe(200);
    let rows = (await state.pg.query("SELECT * FROM fcm_tokens ORDER BY token")).rows;
    expect(rows).toHaveLength(2);

    expect((await call("fcm-unsubscribe", { token: ta }, cookieA)).status).toBe(200);
    rows = (await state.pg.query("SELECT * FROM fcm_tokens")).rows;
    expect(rows).toHaveLength(1);
    expect(rows[0].token).toBe(tb);

    expect((await call("fcm-unsubscribe", { token: tb })).status).toBe(401);
  });
});

describe("FCM sender", () => {
  it("sends a data-only payload with no contact details, and cleans up dead tokens", async () => {
    const p = await register("dead@example.com", "Dead Device");
    const live = token();
    const dead = token();
    await state.pg.query("INSERT INTO fcm_tokens VALUES($1,$2,now())", [live, p.id]);
    await state.pg.query("INSERT INTO fcm_tokens VALUES($1,$2,now())", [dead, p.id]);

    // First token is live, second is unregistered.
    let calls = 0;
    vi.stubGlobal("fetch", async (url: any, init: any) => {
      const u = String(url);
      if (u.includes("oauth2.googleapis.com/token"))
        return new Response(
          JSON.stringify({ access_token: "test-oauth-token", expires_in: 3600 }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      calls++;
      state.fcmSends.push({ url: u, headers: init.headers, body: JSON.parse(init.body) });
      if (init.body.includes(live)) return new Response('{"name":"m/1"}', { status: 200 });
      return new Response(
        JSON.stringify({ error: { status: "NOT_FOUND", message: "Requested entity was not found." } }),
        { status: 404 },
      );
    });

    await fcmNotify("dead@example.com", event, "connection", { name: "Sender" });

    expect(state.fcmSends).toHaveLength(2);
    const msg = state.fcmSends[0];
    expect(msg.url).toBe("https://fcm.googleapis.com/v1/projects/roomroster-test/messages:send");
    expect(msg.headers.authorization).toBe("Bearer test-oauth-token");
    const data = msg.body.message.data;
    expect(data.title).toBe("Sender wants to connect");
    expect(data.url).toBe(`/e/${event}/connections`);
    const raw = JSON.stringify(msg.body);
    expect(raw).not.toContain("dead@example.com");
    expect(raw.toLowerCase()).not.toContain("phone");

    // The dead token is gone, the live one stays.
    const rows = (await state.pg.query("SELECT * FROM fcm_tokens")).rows;
    expect(rows).toHaveLength(1);
    expect(rows[0].token).toBe(live);
  });

  it("notifies on a real connect request alongside web push", async () => {
    const recipient = await register("to@example.com", "Recipient");
    await register("from@example.com", "Sender");
    await state.pg.query("UPDATE profiles SET verified=true");
    const t = token();
    await state.pg.query("INSERT INTO fcm_tokens VALUES($1,$2,now())", [t, recipient.id]);

    const senderCookie = await session("from@example.com");
    const conn = await call("connect", { to: recipient.id }, senderCookie);
    expect(conn.status).toBe(200);
    expect(state.fcmSends).toHaveLength(1);
    expect(state.fcmSends[0].body.message.token).toBe(t);
    expect(state.fcmSends[0].body.message.data.title).toBe("Sender wants to connect");
  });

  it("does nothing when no service account is configured", async () => {
    const saved = process.env.FCM_SERVICE_ACCOUNT;
    delete process.env.FCM_SERVICE_ACCOUNT;
    try {
      const p = await register("quiet@example.com");
      await state.pg.query("INSERT INTO fcm_tokens VALUES($1,$2,now())", [token(), p.id]);
      await fcmNotify("quiet@example.com", event, "accepted", { name: "X" });
      expect(state.fcmSends).toHaveLength(0);
    } finally {
      process.env.FCM_SERVICE_ACCOUNT = saved;
    }
  });
});
