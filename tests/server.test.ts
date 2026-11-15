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

import { PGlite } from "@electric-sql/pglite";
import { eventDefault, blankProfile } from "../src/domain";
const state = vi.hoisted(() => ({
  pg: null as any,
  sent: [] as any[],
  queries: 0,
  failMail: false,
}));
vi.mock("../server/db", () => ({
  db:
    () =>
    async (strings: TemplateStringsArray, ...args: unknown[]) => {
      state.queries++;
      let q = strings[0];
      for (let i = 0; i < args.length; i++) q += `$${i + 1}` + strings[i + 1];
      return (await state.pg.query(q, args)).rows;
    },
}));
vi.mock("nodemailer", () => ({
  default: {
    createTransport: () => ({
      sendMail: async (mail: any) => {
        if (state.failMail)
          throw Object.assign(new Error("SMTP unavailable"), {
            code: "ETIMEDOUT",
          });
        state.sent.push(mail);
        return { accepted: [mail.to] };
      },
    }),
  },
}));
import handler from "../netlify/functions/api";
import worker from "../worker/index";
import digest, {
  enqueueDigests,
  processDigests,
  digestSlot,
} from "../server/digest";
import {
  issueParticipantCode,
  consumeParticipantCode,
} from "../server/participant-auth";
import { ensureParticipantCodes, ensureDigestJobs } from "../server/upgrade";
import { createToken, hash } from "../server/security";
import { flush, queue } from "../server/mail";
import { issueAdminCode, consumeAdminCode } from "../server/admin";
const event = eventDefault.slug;
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
async function register(
  email: string,
  name = "Test person",
  offers: string[] = [],
) {
  const r = await call("register", {
    profile: {
      ...blankProfile(),
      name,
      email,
      startup: "Farm Lab",
      bio: "Testing agricultural tools",
      location: "Pune",
      offers,
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
  process.env.ADMIN_EMAIL = "roomroster07@gmail.com";

  process.env.APP_URL = "http://localhost:8888";
  process.env.SESSION_SECRET = "a".repeat(40);
  process.env.SMTP_USER = "roomroster07@gmail.com";
  process.env.SMTP_PASS = "test-not-real";
  delete process.env.GEMINI_API_KEY;
  state.pg = new PGlite();
  await state.pg.exec(
    await readFile(new URL("../server/schema.sql", import.meta.url), "utf8"),
  );
});
beforeEach(async () => {
  state.sent = [];
  state.failMail = false;
  await state.pg.exec(
    "TRUNCATE events,profiles,connections,tokens,sessions,admin_sessions,admin_codes,participant_codes,digest_jobs,limits,daily_mail,mail_queue,match_updates,digest_cursor,search_cache CASCADE",
  );
  await state.pg.query("INSERT INTO events VALUES($1,$2,$3)", [
    event,
    "roomroster07@gmail.com",
    JSON.stringify(eventDefault),
  ]);
});
afterAll(async () => {
  await state.pg.close();
});
describe("live API against PostgreSQL engine with SMTP mocked", () => {
  it("upgrades an existing database without changing event data", async () => {
    await state.pg.exec("DROP TABLE participant_codes; DROP TABLE digest_jobs");
    await Promise.all([ensureParticipantCodes(), ensureDigestJobs()]);
    expect((await state.pg.query("SELECT * FROM events")).rows).toHaveLength(1);
    expect(
      (await state.pg.query("SELECT * FROM participant_codes")).rows,
    ).toEqual([]);
    expect((await state.pg.query("SELECT * FROM digest_jobs")).rows).toEqual(
      [],
    );
  });
  it("honors the recipient's AI opt-out when generating a digest", async () => {
    const a = await register("alice@example.com");
    await session(a.email);
    await state.pg.query(
      "UPDATE profiles SET data=jsonb_set(data,'{needText}','\"I need a website\"') WHERE id=$1",
      [a.id],
    );
    const b = await register("bob@example.com", "Bob", ["Web / app developer"]);
    await state.pg.query(
      "UPDATE profiles SET data=jsonb_set(data,'{aiConsent}','true') WHERE id=$1",
      [b.id],
    );
    process.env.GEMINI_API_KEY = "test-key";
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    try {
      await digest();
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
      delete process.env.GEMINI_API_KEY;
    }
  });
  it("signs a new attendee in with the welcome code and restores their profile across reloads", async () => {
    const p = await register("alice@example.com", "Alice");
    expect(state.sent).toHaveLength(1);
    const code = state.sent[0].html.match(/font-weight:bold">(\d{6})<\/p>/)[1];
    const stored = (await state.pg.query("SELECT * FROM participant_codes"))
      .rows[0];
    expect(stored.hash).not.toContain(code);
    expect(
      (await call("participant-login", { email: p.email, code: "wrong" }))
        .status,
    ).toBe(401);
    const login = await call("participant-login", { email: p.email, code });
    expect(login.status).toBe(200);
    expect(login.headers.get("set-cookie")).toContain("HttpOnly");
    const cookie = login.headers.get("set-cookie")!.split(";")[0];
    for (let i = 0; i < 3; i++) {
      const loaded = await (await call("load", {}, cookie)).json();
      expect(loaded.me.id).toBe(p.id);
      expect(loaded.me.verified).toBe(true);
    }
    expect((await call("connect", { to: p.id }, cookie)).status).toBe(400);
    expect(
      (await call("participant-login", { email: p.email, code })).status,
    ).toBe(401);
    expect(
      (
        await call(
          "update",
          {
            profile: {
              ...p.data,
              email: p.email,
              phone: "",
              name: "Alice edited",
            },
          },
          cookie,
        )
      ).status,
    ).toBe(200);
    expect((await (await call("load", {}, cookie)).json()).me.name).toBe(
      "Alice edited",
    );
    await call("logout", {}, cookie);
    expect((await (await call("load", {}, cookie)).json()).me).toBeNull();
    const duplicate = await call("register", {
      profile: { ...p.data, email: p.email, phone: "" },
    });
    expect(duplicate.status).toBe(409);
    expect((await duplicate.json()).code).toBe("PROFILE_EXISTS");
  });
  it("scopes attendee codes to an event, expires them and consumes them only once", async () => {
    const p = await register("alice@example.com");
    let code = await issueParticipantCode(event, p.email);
    expect(await consumeParticipantCode("another-event", p.email, code)).toBe(
      false,
    );
    await state.pg.exec(
      "UPDATE participant_codes SET expires=now()-interval '1 minute'",
    );
    expect(await consumeParticipantCode(event, p.email, code)).toBe(false);
    code = await issueParticipantCode(event, p.email);
    for (let i = 0; i < 5; i++)
      expect(
        await consumeParticipantCode(
          event,
          p.email,
          code === "000000" ? "000001" : "000000",
        ),
      ).toBe(false);
    expect(await consumeParticipantCode(event, p.email, code)).toBe(false);
    code = await issueParticipantCode(event, p.email);
    const results = await Promise.all([
      consumeParticipantCode(event, p.email, code),
      consumeParticipantCode(event, p.email, code),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
  });
  it("delivers requested login codes while an essential slot remains, even after match mail used its share", async () => {
    const p = await register("alice@example.com");
    await state.pg.exec("UPDATE daily_mail SET total=3,recommendations=2");
    const r = await call("participant-request-code", { email: p.email });
    expect(r.status).toBe(200);
    expect(state.sent).toHaveLength(2);
    expect(
      (await call("participant-request-code", { email: p.email })).status,
    ).toBe(429);
    expect(
      (
        await state.pg.query(
          "SELECT total FROM daily_mail WHERE email='alice@example.com'",
        )
      ).rows[0].total,
    ).toBe(4);
  });
  it("keeps a profile recoverable when welcome delivery fails", async () => {
    state.failMail = true;
    const r = await call("register", {
      profile: {
        ...blankProfile(),
        name: "Alice",
        email: "alice@example.com",
        startup: "Test",
        bio: "Test",
        location: "Pune",
      },
    });
    expect(r.status).toBe(200);
    expect((await r.json()).codeSent).toBe(false);
    state.failMail = false;
    expect(
      (await call("participant-request-code", { email: "alice@example.com" }))
        .status,
    ).toBe(200);
    expect((await state.pg.query("SELECT * FROM profiles")).rows).toHaveLength(
      1,
    );
  });
  it("uses 1 PM and 9:30 PM India slots, including the midnight date boundary", () => {
    expect(digestSlot(new Date("2026-11-12T07:30:00Z"))).toBe(
      "2026-11-12:afternoon",
    );
    expect(digestSlot(new Date("2026-11-12T16:00:00Z"))).toBe(
      "2026-11-12:evening",
    );
    expect(digestSlot(new Date("2026-11-12T18:31:00Z"))).toBe(
      "2026-11-13:afternoon",
    );
  });
  it("sends two slot-deduplicated digests even without matches, and honors opt-out", async () => {
    const a = await register("alice@example.com");
    await session(a.email);
    const day = digestSlot().split(":")[0];
    for (const slot of [day + ":afternoon", day + ":evening"]) {
      await enqueueDigests(slot);
      await enqueueDigests(slot);
      await processDigests();
      await flush(2);
    }
    expect(state.sent.filter((m) => m.to === a.email)).toHaveLength(3);
    expect(state.sent[2].html).toContain("No new matches this time");
    await enqueueDigests(day + ":evening");
    await processDigests();
    await flush(2);
    expect(state.sent).toHaveLength(3);
    const row = (
      await state.pg.query("SELECT * FROM daily_mail WHERE email=$1", [a.email])
    ).rows[0];
    expect(row.recommendations).toBe(2);
  });
  it("bounds a 50-person digest batch below the Workers subrequest budget", async () => {
    const { randomUUID } = await import("node:crypto");
    for (let i = 0; i < 50; i++)
      await state.pg.query(
        "INSERT INTO profiles(id,event,email,verified,data) VALUES($1,$2,$3,true,$4)",
        [
          randomUUID(),
          event,
          `load-${i}@example.com`,
          JSON.stringify({
            ...blankProfile(),
            name: `Person ${i}`,
            needs: ["Web / app developer"],
            offers: ["Web / app developer"],
            alerts: true,
            aiConsent: false,
          }),
        ],
      );
    await enqueueDigests();
    state.queries = 0;
    await processDigests(2);
    await flush(2);
    // Two SMTP sockets plus up to six optional AI/cache requests leave headroom.
    expect(state.queries + 2 + 6).toBeLessThan(50);
    expect(state.sent).toHaveLength(2);
    expect(
      (
        await state.pg.query(
          "SELECT count(*)::int AS n FROM digest_jobs WHERE state='pending'",
        )
      ).rows[0].n,
    ).toBe(48);
    for (let i = 0; i < 24; i++) {
      await processDigests(2);
      await flush(2);
    }
    expect(state.sent).toHaveLength(50);
    expect(new Set(state.sent.map((m) => m.to)).size).toBe(50);
  });
  it("delivers an admin code, stores only its hash, and consumes it once", async () => {
    const sent = await call("admin-request-code", {
      email: "roomroster07@gmail.com",
    });
    expect(sent.status).toBe(200);
    expect(state.sent[0].subject).toBe("Your RoomRoster sign-in code");
    const code = state.sent[0].html.match(/font-weight:bold">(\d{6})<\/p>/)[1];
    const row = (await state.pg.query("SELECT * FROM admin_codes")).rows[0];
    expect(row.hash).not.toBe(code);
    expect(row.attempts).toBe(0);
    const login = await call("admin-login", {
      email: "roomroster07@gmail.com",
      code,
    });
    expect(login.status).toBe(200);
    expect(
      (await call("admin-login", { email: "roomroster07@gmail.com", code }))
        .status,
    ).toBe(401);
    expect(
      (await call("admin-request-code", { email: "roomroster07@gmail.com" }))
        .status,
    ).toBe(429);
  });
  it("expires codes and locks a challenge after five incorrect guesses", async () => {
    let code = await issueAdminCode();
    await state.pg.exec(
      "UPDATE admin_codes SET expires=now()-interval '1 minute'",
    );
    expect(await consumeAdminCode("roomroster07@gmail.com", code)).toBe(false);
    code = await issueAdminCode();
    const wrong = code === "000000" ? "000001" : "000000";
    for (let i = 0; i < 5; i++)
      expect(await consumeAdminCode("roomroster07@gmail.com", wrong)).toBe(
        false,
      );
    expect(await consumeAdminCode("roomroster07@gmail.com", code)).toBe(false);
    code = await issueAdminCode();
    const results = await Promise.all([
      consumeAdminCode("roomroster07@gmail.com", code),
      consumeAdminCode("roomroster07@gmail.com", code),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
  });
  it("requires an emailed admin code and manages events and participants across rooms", async () => {
    const details = { ...eventDefault, name: "Another event" };
    expect(
      (await call("create-event", { details, email: "roomroster07@gmail.com" }))
        .status,
    ).toBe(403);
    const participantCookie = await session("roomroster07@gmail.com");
    expect((await call("admin-overview", {}, participantCookie)).status).toBe(
      401,
    );
    expect(
      (await call("create-event", { details }, participantCookie)).status,
    ).toBe(403);
    expect(
      (
        await call("admin-login", {
          email: "roomroster07@gmail.com",
          code: "000000",
        })
      ).status,
    ).toBe(401);
    const login = await call("admin-login", {
      email: "roomroster07@gmail.com",
      code: await issueAdminCode(),
    });
    expect(login.status).toBe(200);
    expect(login.headers.get("set-cookie")).toContain("HttpOnly");
    const cookie = login.headers.get("set-cookie")!.split(";")[0];
    const p = await register("person@example.com");
    const created = await (
      await call("create-event", { details }, cookie)
    ).json();
    expect(created.slug).toBeTruthy();
    const overview = await (await call("admin-overview", {}, cookie)).json();
    expect(overview.events).toHaveLength(2);
    expect(overview.participants[0].email).toBe("person@example.com");
    expect((await call("remove", { id: p.id }, cookie)).status).toBe(200);
    expect(
      (await (await call("admin-overview", {}, cookie)).json()).participants,
    ).toHaveLength(0);
    await call("admin-logout", {}, cookie);
    expect((await call("admin-overview", {}, cookie)).status).toBe(401);
  });
  it("rejects old admin sessions when the session secret is rotated", async () => {
    const login = await call("admin-login", {
      email: "roomroster07@gmail.com",
      code: await issueAdminCode(),
    });
    const cookie = login.headers.get("set-cookie")!.split(";")[0];
    const original = process.env.SESSION_SECRET;
    process.env.SESSION_SECRET = "z".repeat(40);
    try {
      expect((await call("admin-overview", {}, cookie)).status).toBe(401);
    } finally {
      process.env.SESSION_SECRET = original;
    }
  });
  it("hides contacts, blocks unauthenticated edits, and unlocks contacts only after recipient acceptance", async () => {
    const a = await register("alice@example.com", "Alice");
    const b = await register("bob@example.com", "Bob", ["Web / app developer"]);
    let data = await (await call("load")).json();
    expect(JSON.stringify(data.profiles)).not.toContain("example.com");
    expect(data.me).toBeNull();
    expect((await call("update", { profile: {} })).status).toBe(401);
    const alice = await session(a.email),
      bob = await session(b.email);
    expect((await call("connect", { to: b.id }, alice)).status).toBe(200);
    data = await (await call("load", {}, alice)).json();
    expect(data.connections[0].email).toBeNull();
    const id = data.connections[0].id;
    expect((await call("respond", { id, accept: true }, alice)).status).toBe(
      409,
    );
    expect((await call("respond", { id, accept: true }, bob)).status).toBe(200);
    data = await (await call("load", {}, alice)).json();
    expect(data.connections[0].email).toBe("bob@example.com");
    expect((await call("connect", { to: b.id }, alice)).status).toBe(200);
    expect(
      (await state.pg.query("SELECT * FROM connections")).rows,
    ).toHaveLength(1);
  });
  it("sends a request note and emails the recipient once, then emails the sender only on acceptance", async () => {
    const a = await register("alice@example.com", "Alice");
    const b = await register("bob@example.com", "Bob");
    await state.pg.query("UPDATE profiles SET verified=true");
    const alice = await session(a.email),
      bob = await session(b.email);
    state.sent = [];
    const long = "x".repeat(301);
    expect(
      (await call("connect", { to: b.id, message: long }, alice)).status,
    ).toBe(400);
    expect(
      (await call("connect", { to: b.id, message: 5 }, alice)).status,
    ).toBe(400);
    expect(state.sent).toHaveLength(0);
    const note = "Hi! Can you share your phone number? <b>x</b>";
    const r = await (
      await call("connect", { to: b.id, message: note }, alice)
    ).json();
    expect(r.created).toBe(true);
    expect(state.sent).toHaveLength(1);
    expect(state.sent[0].to).toBe("bob@example.com");
    expect(state.sent[0].html).toContain("Can you share your phone number?");
    expect(state.sent[0].html).not.toContain("<b>x</b>");
    const dup = await (
      await call("connect", { to: b.id, message: "again" }, alice)
    ).json();
    expect(dup.created).toBe(false);
    expect(state.sent).toHaveLength(1);
    let data = await (await call("load", {}, bob)).json();
    expect(data.connections[0].message).toBe(note);
    expect(data.connections[0].phone).toBeNull();
    const id = data.connections[0].id;
    await call("respond", { id, accept: false }, bob);
    expect(state.sent).toHaveLength(1);
    await state.pg.query("UPDATE connections SET status='pending'");
    await call("respond", { id, accept: true }, bob);
    expect(state.sent).toHaveLength(2);
    expect(state.sent[1].to).toBe("alice@example.com");
    expect(state.sent[1].text).not.toContain("bob@example.com");
    expect(state.sent[1].html).toContain("Bob");
  });
  it("does not email unverified recipients, counts mail against the daily cap, and survives SMTP failure", async () => {
    const a = await register("alice@example.com", "Alice");
    const b = await register("bob@example.com", "Bob");
    await state.pg.query(
      "UPDATE profiles SET verified=true WHERE email='alice@example.com'",
    );
    const alice = await session(a.email);
    state.sent = [];
    expect((await call("connect", { to: b.id }, alice)).status).toBe(200);
    expect(state.sent).toHaveLength(0);
    await state.pg.exec(
      "DELETE FROM connections; UPDATE profiles SET verified=true",
    );
    state.failMail = true;
    expect(
      (await call("connect", { to: b.id, message: "hi" }, alice)).status,
    ).toBe(200);
    expect(
      (await state.pg.query("SELECT * FROM connections")).rows,
    ).toHaveLength(1);
    state.failMail = false;
    await state.pg.query("DELETE FROM connections");
    await state.pg.query(
      "INSERT INTO daily_mail(email,day,total,recommendations) VALUES('bob@example.com',$1,3,0) ON CONFLICT(email,day) DO UPDATE SET total=3",
      [(await import("../src/domain")).indiaDay()],
    );
    state.sent = [];
    await call("connect", { to: b.id }, alice);
    expect(state.sent).toHaveLength(0);
    expect(
      (
        await state.pg.query(
          "SELECT state FROM mail_queue WHERE kind='connection' ORDER BY created DESC",
        )
      ).rows[0].state,
    ).toBe("pending");
  });
  it("keeps cap-held request and acceptance emails pending through digest enqueue, then sends them once under the cap", async () => {
    const a = await register("alice@example.com", "Alice");
    const b = await register("bob@example.com", "Bob");
    await state.pg.query("UPDATE profiles SET verified=true");
    const alice = await session(a.email),
      bob = await session(b.email);
    const day = (await import("../src/domain")).indiaDay();
    await state.pg.query(
      "INSERT INTO daily_mail(email,day,total,recommendations) VALUES('bob@example.com',$1,3,0),('alice@example.com',$1,3,0) ON CONFLICT(email,day) DO UPDATE SET total=3",
      [day],
    );
    state.sent = [];
    await call("connect", { to: b.id, message: "hello" }, alice);
    const id = (await state.pg.query("SELECT id FROM connections")).rows[0].id;
    await call("respond", { id, accept: true }, bob);
    const held = () =>
      state.pg.query(
        "SELECT kind,state FROM mail_queue WHERE kind IN ('connection','accepted') ORDER BY kind",
      );
    expect((await held()).rows).toEqual([
      { kind: "accepted", state: "pending" },
      { kind: "connection", state: "pending" },
    ]);
    await enqueueDigests();
    expect((await held()).rows.map((r: any) => r.state)).toEqual([
      "pending",
      "pending",
    ]);
    expect(state.sent).toHaveLength(0);
    await state.pg.exec("DELETE FROM daily_mail");
    await flush(5);
    await flush(5);
    expect(
      state.sent.filter((m) =>
        /wants to connect|accepted your/.test(m.subject),
      ),
    ).toHaveLength(2);
    expect((await held()).rows.map((r: any) => r.state)).toEqual([
      "sent",
      "sent",
    ]);
  });
  it("limits request/acceptance notices to 2 a day per person, leaves a slot for sign-in, and delivers the held one after the day rolls over", async () => {
    const day = (await import("../src/domain")).indiaDay();
    const dee = await register("dee@example.com", "Dee");
    const senders = [] as any[];
    for (const n of ["a", "b", "c"])
      senders.push(await register(`${n}@example.com`, n.toUpperCase()));
    await state.pg.exec("UPDATE profiles SET verified=true");
    await state.pg.exec("DELETE FROM daily_mail");
    state.sent = [];
    for (const p of senders)
      await call(
        "connect",
        { to: dee.id, message: "hi" },
        await session(p.email),
      );
    const notices = () =>
      state.sent.filter((m) => /wants to connect/.test(m.subject));
    expect(notices()).toHaveLength(2);
    const q = () =>
      state.pg.query(
        "SELECT state,count(*)::int c FROM mail_queue WHERE kind='connection' GROUP BY state ORDER BY state",
      );
    expect((await q()).rows).toEqual([
      { state: "pending", c: 1 },
      { state: "sent", c: 2 },
    ]);
    // A sign-in code still gets the third essential slot.
    state.sent = [];
    expect(
      (await call("participant-request-code", { email: dee.email })).status,
    ).toBe(200);
    expect(state.sent).toHaveLength(1);
    // Cron ticks the same day change nothing: no duplicates, still held.
    await worker.scheduled({ cron: "* * * * *" });
    await worker.scheduled({ cron: "* * * * *" });
    expect(notices()).toHaveLength(0);
    // Midnight rollover (yesterday's counters no longer apply).
    await state.pg.query("UPDATE daily_mail SET day='2000-01-01'");
    state.sent = [];
    await worker.scheduled({ cron: "* * * * *" });
    await worker.scheduled({ cron: "* * * * *" });
    expect(notices()).toHaveLength(1);
    expect((await q()).rows).toEqual([{ state: "sent", c: 3 }]);
    const per = (
      await state.pg.query(
        "SELECT total,notices FROM daily_mail WHERE email='dee@example.com' AND day=$1",
        [day],
      )
    ).rows[0];
    expect(per).toEqual({ total: 1, notices: 1 });
  });
  it("applies a sender-wide daily cap with a reserve that only sign-in codes can use", async () => {
    process.env.SENDER_DAILY_CAP = "10";
    try {
      const a = await register("alice@example.com", "Alice");
      const b = await register("bob@example.com", "Bob");
      await state.pg.exec("UPDATE profiles SET verified=true");
      const alice = await session(a.email);
      const day = (await import("../src/domain")).indiaDay();
      await state.pg.exec("DELETE FROM daily_mail");
      await state.pg.query(
        "INSERT INTO daily_mail(email,day,total) VALUES('*',$1,8)",
        [day],
      );
      state.sent = [];
      await call("connect", { to: b.id }, alice);
      expect(state.sent).toHaveLength(0);
      expect(
        (
          await state.pg.query(
            "SELECT state FROM mail_queue WHERE kind='connection'",
          )
        ).rows[0].state,
      ).toBe("pending");
      expect(
        (await call("participant-request-code", { email: b.email })).status,
      ).toBe(200);
      expect(state.sent).toHaveLength(1);
      expect(
        (
          await state.pg.query(
            "SELECT total FROM daily_mail WHERE email='*' AND day=$1",
            [day],
          )
        ).rows[0].total,
      ).toBe(9);
    } finally {
      delete process.env.SENDER_DAILY_CAP;
    }
  });
  it("never retries an SMTP failure automatically, and a failed send keeps its reservation", async () => {
    const a = await register("alice@example.com", "Alice");
    const b = await register("bob@example.com", "Bob");
    await state.pg.exec("UPDATE profiles SET verified=true");
    const alice = await session(a.email);
    const day = (await import("../src/domain")).indiaDay();
    state.sent = [];
    state.failMail = true;
    await call("connect", { to: b.id, message: "hi" }, alice);
    state.failMail = false;
    await worker.scheduled({ cron: "* * * * *" });
    await flush(5);
    expect(state.sent).toHaveLength(0);
    const row = (
      await state.pg.query(
        "SELECT state FROM mail_queue WHERE kind='connection'",
      )
    ).rows;
    expect(row).toEqual([{ state: "failed" }]);
    expect(
      (
        await state.pg.query(
          "SELECT notices FROM daily_mail WHERE email='bob@example.com' AND day=$1",
          [day],
        )
      ).rows[0].notices,
    ).toBe(1);
  });
  it("serializes counters under simultaneous flushes and serves due notices before match mail", async () => {
    const a = await register("alice@example.com", "Alice");
    const b = await register("bob@example.com", "Bob");
    await state.pg.exec("UPDATE profiles SET verified=true");
    await state.pg.exec("DELETE FROM daily_mail");
    state.sent = [];
    for (let i = 0; i < 4; i++) {
      await queue(
        "bob@example.com",
        event,
        "match",
        { profile: b.id, matches: [] },
        "m" + i,
      );
    }
    await queue(
      "bob@example.com",
      event,
      "connection",
      { name: "A", message: "" },
      "n1",
    );
    await queue(
      "bob@example.com",
      event,
      "connection",
      { name: "B", message: "" },
      "n2",
    );
    await queue(
      "bob@example.com",
      event,
      "connection",
      { name: "C", message: "" },
      "n3",
    );
    await queue("bob@example.com", event, "participant-code", {}, "c1");
    await queue("bob@example.com", event, "participant-code", {}, "c2");
    // One send first: a due notice or code, never a match mail.
    await flush(1, "bob@example.com");
    expect(state.sent[0].subject).not.toMatch(/Your update/);
    await Promise.all([1, 2, 3, 4].map(() => flush(3, "bob@example.com")));
    const row = (
      await state.pg.query(
        "SELECT total,recommendations,notices FROM daily_mail WHERE email='bob@example.com'",
      )
    ).rows[0];
    expect(row.total - row.recommendations).toBeLessThanOrEqual(3);
    expect(row.notices).toBeLessThanOrEqual(2);
    expect(row.recommendations).toBeLessThanOrEqual(2);
    expect(state.sent).toHaveLength(row.total);
    expect(
      (await state.pg.query("SELECT total FROM daily_mail WHERE email='*'"))
        .rows[0].total,
    ).toBe(row.total);
    const states = (
      await state.pg.query(
        "SELECT state,count(*)::int c FROM mail_queue WHERE email='bob@example.com' GROUP BY state",
      )
    ).rows;
    expect(states.find((r: any) => r.state === "sending")).toBeUndefined();
    void a;
  });
  it("rejects cross-event connection requests and unprivileged organizer operations", async () => {
    const a = await register("alice@example.com");
    const cookie = await session(a.email);
    await state.pg.query("INSERT INTO events VALUES($1,$2,$3)", [
      "elsewhere",
      "host@example.com",
      JSON.stringify({ ...eventDefault, slug: "elsewhere" }),
    ]);
    const b = await call("register", {
      event: "elsewhere",
      profile: {
        ...blankProfile(),
        name: "Other",
        email: "other@example.com",
        startup: "Other farm",
        bio: "A farm",
        location: "Pune",
      },
    });
    expect(b.status).toBe(200);
    const other = (
      await state.pg.query("SELECT id FROM profiles WHERE event=$1", [
        "elsewhere",
      ])
    ).rows[0];
    expect((await call("connect", { to: other.id }, cookie)).status).toBe(400);
    expect((await call("remove", { id: a.id }, cookie)).status).toBe(403);
  });
  it("reserves a global mail cap atomically and stops recommendation mail after two", async () => {
    await register("alice@example.com");
    await session("alice@example.com");
    const profile = (await state.pg.query("SELECT id FROM profiles")).rows[0]
      .id;
    for (let i = 0; i < 4; i++) {
      const candidate = await register(
        `candidate-${i}@example.com`,
        `Candidate ${i}`,
      );
      await queue(
        "alice@example.com",
        event,
        "match",
        {
          profile,
          count: 0,
          until: new Date().toISOString(),
          matches: [
            {
              id: candidate.id,
              name: candidate.data.name,
              reason: "Offers web development.",
            },
          ],
        },
        "test-" + i,
      );
    }
    // Registration flushes the queue; count recommendation mail already sent too.
    const already = state.sent.filter(
      (m) =>
        m.to === "alice@example.com" &&
        m.subject.startsWith("Your update from"),
    ).length;
    state.sent = [];
    await Promise.all([flush(4), flush(4)]);
    expect(state.sent.filter((m) => m.to === "alice@example.com")).toHaveLength(
      2 - already,
    );
    const row = (
      await state.pg.query("SELECT * FROM daily_mail WHERE email=$1", [
        "alice@example.com",
      ])
    ).rows[0];
    expect(row.total).toBe(3);
    expect(row.recommendations).toBe(2);
  });
  it("does not consume links on GET and consumes them exactly once on POST", async () => {
    await register("alice@example.com");
    const token = await createToken("alice@example.com", event, "access");
    const url = "http://localhost:8888/api/link?token=" + token;
    expect((await handler(new Request(url))).status).toBe(200);
    expect((await handler(new Request(url, { method: "POST" }))).status).toBe(
      303,
    );
    expect((await handler(new Request(url, { method: "POST" }))).status).toBe(
      410,
    );
  });
  it("supports unsubscribe and cancels queued recommendations", async () => {
    const p = await register("alice@example.com");
    await session(p.email);
    await queue(p.email, event, "match", { matches: [] }, "unsubscribe-test");
    const token = await createToken(p.email, event, "unsubscribe");
    await handler(
      new Request("http://localhost:8888/api/link?token=" + token, {
        method: "POST",
      }),
    );
    const before = state.sent.length;
    await flush();
    expect(state.sent).toHaveLength(before);
    expect(
      (await state.pg.query("SELECT data FROM profiles")).rows[0].data.alerts,
    ).toBe(false);
  });
  it("emails new matching people once, with exact event counts", async () => {
    const a = await register("alice@example.com");
    await session(a.email);
    await state.pg.query(
      "UPDATE profiles SET data=jsonb_set(data,'{needText}','\"I need a website\"') WHERE id=$1",
      [a.id],
    );
    await register("bob@example.com", "Bob", ["Web / app developer"]);
    state.sent = [];
    await digest();
    expect(state.sent).toHaveLength(1);
    expect(state.sent[0].html).toContain("<strong>1 new person</strong>");
    expect(state.sent[0].html).toContain("Bob");
    await digest();
    expect(state.sent).toHaveLength(1);
  });
});
