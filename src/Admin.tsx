import { useEffect, useState, type ReactNode, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { Paper } from "./components/ui/paper";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "./components/ui/dialog";
import { api as sharedApi } from "./api";
const api: typeof sharedApi = (action, body) =>
  sharedApi(action === "remove" ? "admin-remove" : action, body);
import type { EventInfo, Profile } from "./domain";
type Overview = {
  events: (EventInfo & { participants: number; connections: number })[];
  participants: Profile[];
  mail: { state: string; count: number }[];
  services: Record<string, boolean>;
};
export default function Admin({ createForm }: { createForm: ReactNode }) {
  const nav = useNavigate(),
    location = useLocation();
  const [ready, setReady] = useState(false),
    [authenticated, auth] = useState(false),
    [email, setEmail] = useState("roomroster07@gmail.com"),
    [code, setCode] = useState(""),
    [codeSent, setCodeSent] = useState(false),
    [resendAt, setResendAt] = useState(0),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [data, setData] = useState<Overview>(),
    [event, setEvent] = useState(""),
    [search, setSearch] = useState(""),
    [remove, setRemove] = useState<Profile>();
  async function load() {
    setData(await api<Overview>("admin-overview"));
  }
  useEffect(() => {
    api("admin-session")
      .then(async (r) => {
        auth(r.authenticated);
        if (r.authenticated) await load();
      })
      .catch((e) => setError(e.message))
      .finally(() => setReady(true));
  }, [location.pathname]);
  async function login(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (!codeSent) {
        const result = await api("admin-request-code", { email });
        setCodeSent(true);
        setResendAt(Date.now() + 60000);
        setError(result.message);
        return;
      }
      await api("admin-login", { email, code });
      setCode("");
      auth(true);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!ready)
    return (
      <main id="main" className="standalone">
        <p role="status">Opening the host’s notebook…</p>
      </main>
    );
  if (!authenticated)
    return (
      <main id="main" className="shell">
        <header>
          <Link className="logo" to="/">
            roomroster ✳
          </Link>
          <Link to="/">Back to the portal</Link>
        </header>
        <section className="form-page">
          <span className="eyebrow">THE HOST’S NOTEBOOK</span>
          <h1>
            Welcome back,
            <br />
            organizer.
          </h1>
          <p>One secure place to look after your events and people.</p>
          <Paper stock="card" className="form-paper">
            <form onSubmit={login}>
              <label className="field">
                <span>Admin email</span>
                <Input
                  required
                  type="email"
                  autoComplete="username"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setCodeSent(false);
                    setCode("");
                  }}
                />
              </label>
              {codeSent && (
                <label className="field">
                  <span>Six-digit email code</span>
                  <Input
                    required
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]{6}"
                    autoComplete="one-time-code"
                    maxLength={6}
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                  />
                </label>
              )}
              {error && (
                <p className="notice" role="alert">
                  {error}
                </p>
              )}
              <Button disabled={busy} type="submit">
                {busy
                  ? "Please wait…"
                  : codeSent
                    ? "Verify code & sign in"
                    : "Email me a sign-in code"}
              </Button>
              {codeSent && (
                <Button
                  type="button"
                  variant="ghost"
                  disabled={busy}
                  onClick={async () => {
                    if (Date.now() < resendAt) {
                      setError(
                        "Please wait a minute before requesting another code.",
                      );
                      return;
                    }
                    setBusy(true);
                    try {
                      const result = await api("admin-request-code", { email });
                      setError(result.message);
                      setResendAt(Date.now() + 60000);
                    } catch (e) {
                      setError((e as Error).message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Resend code
                </Button>
              )}
            </form>
          </Paper>
        </section>
      </main>
    );
  if (location.pathname === "/admin/create")
    return (
      <>
        <div className="shell">
          <Link className="text-link" to="/admin">
            ← Admin dashboard
          </Link>
        </div>
        {createForm}
      </>
    );
  const filtered =
    data?.participants.filter(
      (p) =>
        (!event || p.event === event) &&
        [p.name, p.startup, p.email]
          .join(" ")
          .toLowerCase()
          .includes(search.toLowerCase()),
    ) || [];
  return (
    <div className="shell">
      <header>
        <Link className="logo" to="/">
          roomroster ✳
        </Link>
        <Button
          variant="outline"
          onClick={async () => {
            try {
              await api("admin-logout");
              auth(false);
              setData(undefined);
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        >
          Sign out
        </Button>
      </header>
      <main id="main" className="content-page">
        <span className="eyebrow">THE HOST’S NOTEBOOK</span>
        <h1>Your rooms. Your people.</h1>
        <p>Create events, look after participants, and check email delivery.</p>
        {error && (
          <p role="status" className="notice">
            {error}
          </p>
        )}
        <Button asChild>
          <Link to="/admin/create">Create an event +</Link>
        </Button>
        <div className="section-title">
          <h2>All events</h2>
          <span>{data?.events.length || 0} rooms</span>
        </div>
        <div className="event-grid">
          {data?.events.map((e) => (
            <Paper stock="card" className="event-card" key={e.slug}>
              <h2>{e.name}</h2>
              <p>
                {e.participants} participants · {e.connections} accepted
                connections
              </p>
              <p>{e.closed ? "Registrations closed" : "Registrations open"}</p>
              <div className="inline-actions">
                <Link className="text-link" to={`/e/${e.slug}`}>
                  Open directory
                </Link>
                <Link className="text-link" to={`/e/${e.slug}/organizer`}>
                  Edit event
                </Link>
                <button className="text-link" onClick={() => setEvent(e.slug)}>
                  View participants
                </button>
              </div>
            </Paper>
          ))}
        </div>
        <div className="section-title">
          <h2>Participants</h2>
          <span>{filtered.length} people</span>
        </div>
        <div className="form-row">
          <label className="field">
            <span>Filter by event</span>
            <select value={event} onChange={(e) => setEvent(e.target.value)}>
              <option value="">All events</option>
              {data?.events.map((e) => (
                <option key={e.slug} value={e.slug}>
                  {e.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Search participants</span>
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Name, startup, or email"
            />
          </label>
        </div>
        {!filtered.length && (
          <p className="empty">
            No participants yet. Share an event link to welcome your first
            person.
          </p>
        )}
        {filtered.map((p) => (
          <div className="organizer-row" key={p.id}>
            <div>
              <strong>{p.name}</strong>
              <p>
                {p.startup} ·{" "}
                {data?.events.find((e) => e.slug === p.event)?.name}
              </p>
              <small>
                {p.email} ·{" "}
                {p.verified ? "Email confirmed" : "Awaiting confirmation"}
              </small>
            </div>
            <Button variant="outline" onClick={() => setRemove(p)}>
              Remove
            </Button>
          </div>
        ))}
        <div className="section-title">
          <h2>Email & services</h2>
        </div>
        <Paper stock="card" className="form-paper">
          <div className="chips">
            {Object.entries(data?.services || {}).map(([key, value]) => (
              <span className="tag" key={key}>
                {key}: {value ? "configured" : "not configured"}
              </span>
            ))}
          </div>
          <p className="admin-mail-help">
            Replies to automatic emails go to roomroster07@gmail.com. Sending
            configuration must be tested before welcoming attendees.
          </p>
          <div className="chips">
            {data?.mail.map((m) => (
              <span className="tag" key={m.state}>
                {m.state}: {m.count}
              </span>
            ))}
          </div>
          <div className="inline-actions admin-mail-help">
            <Button
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  const r = await api("admin-test-email");
                  setError(r.message);
                  await load();
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Send test email to admin
            </Button>
            <Button
              variant="ghost"
              onClick={() => load().catch((e) => setError(e.message))}
            >
              Refresh delivery status
            </Button>
          </div>
        </Paper>
      </main>
      {remove && (
        <Dialog open onOpenChange={(v) => !v && setRemove(undefined)}>
          <DialogContent className="rr-modal">
            <DialogTitle>Remove {remove.name}?</DialogTitle>
            <DialogDescription>
              This removes their event profile and connections and cancels
              pending messages to them in this event. It cannot be undone.
            </DialogDescription>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await api("remove", { event: remove.event, id: remove.id });
                  setRemove(undefined);
                  await load();
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Remove participant
            </Button>
            <Button variant="outline" onClick={() => setRemove(undefined)}>
              Keep participant
            </Button>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
