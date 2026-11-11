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
const state = vi.hoisted(() => ({ pg: null as any, sent: [] as any[] }));
vi.mock("../server/db", () => ({
  db:
    () =>
    async (strings: TemplateStringsArray, ...args: unknown[]) => {
      let q = strings[0];
      for (let i = 0; i < args.length; i++) q += `$${i + 1}` + strings[i + 1];
      return (await state.pg.query(q, args)).rows;
    },
}));
vi.mock("nodemailer", () => ({
  default: {
    createTransport: () => ({
      sendMail: async (mail: any) => {
        state.sent.push(mail);
        return { accepted: [mail.to] };
      },
    }),
  },
}));
import handler from "../netlify/functions/api";
import digest from "../server/digest";
import { createToken, hash } from "../server/security";
import { flush, queue } from "../server/mail";
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
  await state.pg.exec(
    "TRUNCATE events,profiles,connections,tokens,sessions,limits,daily_mail,mail_queue,match_updates,digest_cursor,search_cache CASCADE",
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
      const candidate = await register(`candidate-${i}@example.com`, `Candidate ${i}`);
      await queue(
        "alice@example.com",
        event,
        "match",
        { profile, count: 0, until: new Date().toISOString(), matches: [{id:candidate.id,name:candidate.data.name,reason:'Offers web development.'}] },
        "test-" + i,
      );
    }
    // Registration flushes the queue; count recommendation mail already sent too.
    const already = state.sent.filter(m=>m.to==='alice@example.com'&&m.subject.startsWith('People you may')).length;
    state.sent = [];
    await Promise.all([flush(4), flush(4)]);
    expect(state.sent.filter(m=>m.to==='alice@example.com')).toHaveLength(2-already);
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
