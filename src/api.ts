import { demoProfiles } from "./demo";
import {
  eventDefault,
  rankProfiles,
  type Profile,
  type EventInfo,
  type Connection,
} from "./domain";
export const DEMO = import.meta.env.VITE_DEMO_MODE !== "false";
type Store = {
  events: EventInfo[];
  profiles: Profile[];
  connections: Connection[];
  self: Record<string, string>;
};
function read(): Store {
  try {
    const s = localStorage.getItem("roomroster-v1");
    if (s) return JSON.parse(s);
  } catch {}
  return {
    events: [eventDefault],
    profiles: demoProfiles,
    connections: [],
    self: {},
  };
}
function save(s: Store) {
  localStorage.setItem("roomroster-v1", JSON.stringify(s));
}
export async function api<T = any>(
  action: string,
  body: Record<string, any> = {},
): Promise<T> {
  if (!DEMO) {
    const r = await fetch(`/api/${action}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await r.json();
    if (!r.ok)
      throw new Error(data.error || "Something went wrong. Please try again.");
    return data;
  }
  const s = read();
  let result: any;
  const event = body.event || eventDefault.slug;
  const me = s.profiles.find((p) => p.id === s.self[event]);
  switch (action) {
    case "load":
      result = {
        event: s.events.find((e) => e.slug === event),
        profiles: s.profiles.filter((p) => p.event === event),
        me,
        connections: s.connections.filter(
          (c) => c.event === event && (c.from === me?.id || c.to === me?.id),
        ),
        admin: true,
      };
      break;
    case "events":
      result = s.events;
      break;
    case "register": {
      if (s.events.find((e) => e.slug === event)?.closed)
        throw Error("This directory is closed.");
      if (
        s.profiles.some(
          (p) => p.event === event && p.email === body.profile.email,
        )
      )
        throw Error(
          "This email already has a profile. Use “Return to your profile”.",
        );
      const p = {
        ...body.profile,
        id: crypto.randomUUID(),
        joined: new Date().toISOString(),
        event,
        verified: true,
      };
      s.profiles.push(p);
      s.self[event] = p.id;
      result = p;
      break;
    }
    case "update":
      if (!me) throw Error("Join this event first.");
      Object.assign(me, body.profile, { id: me.id, event });
      result = me;
      break;
    case "search":
      result = {
        matches: rankProfiles(
          body.query,
          s.profiles.filter((p) => p.event === event),
          body.self,
        ),
        mode: "keyword",
      };
      break;
    case "connect":
      if (!me) throw Error("Join the directory first.");
      if (
        !s.connections.some(
          (c) =>
            c.event === event &&
            [c.from, c.to].includes(me.id) &&
            [c.from, c.to].includes(body.to),
        )
      )
        s.connections.push({
          id: crypto.randomUUID(),
          event,
          from: me.id,
          to: body.to,
          status: "pending",
          created: new Date().toISOString(),
        });
      result = { ok: true };
      break;
    case "respond": {
      const c = s.connections.find((c) => c.id === body.id && c.to === me?.id);
      if (!c) throw Error("Request not found.");
      c.status = body.accept ? "accepted" : "declined";
      result = { ok: true };
      break;
    }
    case "create-event": {
      const e = {
        ...body.details,
        slug: `${body.details.name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "")}-${crypto.randomUUID().slice(0, 6)}`,
      };
      s.events.push(e);
      result = e;
      break;
    }
    case "event-update":
      Object.assign(
        s.events.find((e) => e.slug === event)!,
        body.details,
      );
      result = { ok: true };
      break;
    case "remove":
      s.profiles = s.profiles.filter(
        (p) => !(p.event === event && p.id === body.id),
      );
      s.connections = s.connections.filter(
        (c) => c.from !== body.id && c.to !== body.id,
      );
      result = { ok: true };
      break;
    case "logout":
      delete s.self[event];
      result = { ok: true };
      break;
    case "access": {
      const p = s.profiles.find(
        (p) => p.event === event && p.email === body.email,
      );
      if (p) s.self[event] = p.id;
      result = {
        message: p
          ? "Preview profile restored on this device."
          : "No preview profile found for that email.",
      };
      break;
    }
    default:
      throw Error("Action unavailable in preview.");
  }
  save(s);
  return result;
}
