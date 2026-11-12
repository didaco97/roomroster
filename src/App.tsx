import {
  useEffect,
  useState,
  useCallback,
  useId,
  useRef,
  type ReactNode,
  type FormEvent,
} from "react";
import {
  Link,
  Routes,
  Route,
  useParams,
  useNavigate,
  useLocation,
} from "react-router-dom";
import {
  ArrowRight,
  ArrowUpRight,
  Search,
  Sparkles,
  MapPin,
  Users,
  Mail,
  Plus,
  Check,
  Leaf,
  Globe,
  Link as LinkIcon,
  Bell,
  SlidersHorizontal,
  ArrowLeft,
  NotebookPen,
  Handshake,
  CheckCheck,
  LogOut,
  Copy,
  CalendarDays,
  Camera,
  Upload,
  LoaderCircle,
} from "lucide-react";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { Textarea } from "./components/ui/textarea";
import { Paper } from "./components/ui/paper";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "./components/ui/dialog";
import { api, DEMO } from "./api";
import Admin from "./Admin";
import ParticipantLogin from "./ParticipantLogin";
import {
  blankProfile,
  eventDefault,
  initials,
  roles,
  sectors,
  rankProfiles,
  type Profile,
  type EventInfo,
  type Connection,
} from "./domain";

type Data = {
  event?: EventInfo;
  profiles: Profile[];
  me?: Profile;
  connections: Connection[];
  admin: boolean;
};
function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
function Modal({
  title,
  description,
  children,
  close,
}: {
  title: string;
  description: string;
  children: ReactNode;
  close: () => void;
}) {
  const opener = useRef(document.activeElement as HTMLElement | null);
  return (
    <Dialog open onOpenChange={(v) => !v && close()}>
      <DialogContent
        className="rr-modal"
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          const target = opener.current;
          if (
            target?.isConnected &&
            target !== document.body &&
            !target.closest('[role="dialog"]')
          )
            target.focus({ preventScroll: true });
          else
            document
              .querySelector<HTMLElement>("#main")
              ?.focus({ preventScroll: true });
        }}
      >
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
        {children}
      </DialogContent>
    </Dialog>
  );
}
function Avatar({ p, large = false }: { p: Profile; large?: boolean }) {
  return (
    <div
      className={`avatar ${large ? "large" : ""} color-${p.name.length % 4}`}
    >
      {p.photo ? (
        <img src={p.photo} alt={`${p.name}'s profile`} loading="lazy" />
      ) : (
        initials(p.name)
      )}
    </div>
  );
}
function DateRange({ event }: { event: EventInfo }) {
  const f = (s: string) =>
    new Date(s + "T12:00:00").toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
    });
  return (
    <>
      {f(event.start)} – {f(event.end)}, {event.end.slice(0, 4)}
    </>
  );
}
function Logo() {
  return (
    <Link className="logo" to="/" aria-label="RoomRoster home">
      <span className="logo-mark">
        <NotebookPen size={23} />
      </span>
      roomroster<span className="logo-dot">✳</span>
    </Link>
  );
}
function Footer() {
  return (
    <footer>
      <span>Good people. Same room. New possibilities.</span>
      <span>
        Made with a little ink & intention.{" "}
        <Link to="/">
          Explore RoomRoster <ArrowUpRight size={14} />
        </Link>
      </span>
    </footer>
  );
}
function RolePicker({
  label,
  values,
  set,
}: {
  label: string;
  values: string[];
  set: (v: string[]) => void;
}) {
  const id = useId();
  const [more, show] = useState(false);
  return (
    <fieldset className="role-picker">
      <legend>{label}</legend>
      <div className="chips">
        {roles.slice(0, more ? roles.length : 6).map((r, i) => (
          <label
            key={r}
            className={`choice ${values.includes(r) ? "selected" : ""}`}
          >
            <input
              id={id + i}
              type="checkbox"
              checked={values.includes(r)}
              onChange={() =>
                set(
                  values.includes(r)
                    ? values.filter((x) => x !== r)
                    : [...values, r],
                )
              }
            />
            {r}
          </label>
        ))}
      </div>
      <button type="button" className="text-link" onClick={() => show(!more)}>
        {more ? "Fewer roles" : "See more roles +"}
        {!more &&
          values.filter((r) => !roles.slice(0, 6).includes(r)).length > 0 &&
          " (more selected)"}
      </button>
    </fieldset>
  );
}
function ProfileCard({
  p,
  open,
  reason,
  isSelf = false,
}: {
  p: Profile;
  isSelf?: boolean;
  open: () => void;
  reason?: string;
}) {
  return (
    <Paper stock="card" className="profile-card">
      <div className="card-top">
        <Avatar p={p} />
        <span className="sector">{isSelf ? "Your profile" : p.sector}</span>
      </div>
      <button className="profile-name" onClick={open}>
        {p.name}
        <ArrowUpRight size={19} />
      </button>
      <p className="startup">{p.startup}</p>
      <p className="bio">{p.bio}</p>
      <p className="location">
        <MapPin size={14} />
        {p.location}
      </p>
      <div className="card-skills">
        <small>COME TO ME FOR</small>
        <div className="chips">
          {p.offers.slice(0, 2).map((s) => (
            <span className="tag" key={s}>
              {s}
            </span>
          ))}
          {!p.offers.length && (
            <span>{p.offerText || "A good conversation"}</span>
          )}
        </div>
      </div>
      {reason && (
        <p className="match-reason">
          <Sparkles size={14} />
          {reason}
        </p>
      )}
      <button className="card-link" onClick={open}>
        {isSelf ? "View your profile" : "Say hello"} <ArrowRight size={17} />
      </button>
    </Paper>
  );
}
export default function App() {
  const l = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [l.pathname]);
  return (
    <>
      <a href="#main" className="skip">
        Skip to content
      </a>
      {DEMO && (
        <div className="preview-bar">
          PREVIEW NOTE{" "}
          <span>
            Fictional sample people · saved on this device · no emails sent
          </span>
        </div>
      )}
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/create" element={<ContactEvent />} />
        <Route
          path="/admin/*"
          element={<Admin createForm={<CreateEvent />} />}
        />
        <Route path="/e/:slug/*" element={<EventRoute />} />
        <Route
          path="*"
          element={
            <main id="main" className="standalone">
              <Logo />
              <h1>This page wandered off.</h1>
              <Link to="/">Back to RoomRoster</Link>
            </main>
          }
        />
      </Routes>
    </>
  );
}
function Landing() {
  const [events, set] = useState<EventInfo[]>([]);
  const [loadError, setLoadError] = useState("");
  useEffect(() => {
    api<EventInfo[]>("events")
      .then(set)
      .catch(() =>
        setLoadError(
          "The directory is temporarily unavailable. Please try again shortly, or email roomroster07@gmail.com.",
        ),
      );
  }, []);
  return (
    <div className="shell">
      <header className="landing-header">
        <Logo />
        <Button asChild variant="outline">
          <Link to="/create" aria-label="Create a room">
            New room
          </Link>
        </Button>
      </header>
      <main id="main" tabIndex={-1}>
        <section className="landing-hero">
          <div className="landing-copy">
            <span className="eyebrow">
              LESS AWKWARD NETWORKING. MORE GOOD CONNECTIONS.
            </span>
            <h1>
              The best thing in the room?
              <br />
              <span className="highlight">The people.</span>
            </h1>
            <p>
              Find your event’s people, discover their skills, and turn a hello
              into something useful.
            </p>
            <Button asChild size="lg">
              <Link to="/create">
                Make room for your people <ArrowRight size={18} />
              </Link>
            </Button>
          </div>
          <div className="landing-note">
            <Paper stock="card" tape="top" className="note">
              <span className="scribble">
                You never know what
                <br />
                one hello can start.
              </span>
              <Handshake size={64} strokeWidth={1} />
            </Paper>
          </div>
        </section>
        <div className="section-title">
          <h2>Find your room</h2>
          <span className="hand-note">a good place to begin ↘</span>
        </div>
        <div className="event-grid">
          {loadError && (
            <p role="status" className="notice">
              {loadError}
            </p>
          )}
          {events.map((e) => (
            <Paper key={e.slug} className="event-card" stock="card">
              <span className="eyebrow">PARTICIPANT DIRECTORY</span>
              <h2>{e.name}</h2>
              <p>{e.subtitle}</p>
              <p className="location">
                <MapPin size={16} />
                {e.location} · <DateRange event={e} />
              </p>
              <Button asChild variant="outline">
                <Link to={`/e/${e.slug}`}>
                  Step inside <ArrowRight size={16} />
                </Link>
              </Button>
            </Paper>
          ))}
        </div>
        <section className="how">
          <h2>A few details. A room full of possibilities.</h2>
          {[
            [
              "01",
              "Make it yours",
              "Get in touch and we’ll help set up your event’s own directory.",
            ],
            [
              "02",
              "Bring your whole self",
              "Share what you’re building, what you need, and what you can offer.",
            ],
            [
              "03",
              "Find your people",
              "Discover relevant skills and connect with a little more context.",
            ],
          ].map(([n, t, d]) => (
            <div key={n}>
              <span className="number">{n}</span>
              <h3>{t}</h3>
              <p>{d}</p>
            </div>
          ))}
        </section>
      </main>
      <Footer />
    </div>
  );
}
function ContactEvent() {
  return (
    <div className="shell">
      <header>
        <Logo />
        <Link to="/">Back to rooms</Link>
      </header>
      <main id="main" className="form-page">
        <span className="eyebrow">MAKE ROOM FOR YOUR PEOPLE</span>
        <h1>
          Your event.
          <br />A room of its own.
        </h1>
        <p>
          Hosting a gathering? Tell us a little about your event and we’ll help
          you set up a participant directory.
        </p>
        <Paper stock="card" className="form-paper">
          <h2>Let’s put it together.</h2>
          <p className="admin-mail-help">
            Email us your event name, dates, and approximate number of
            participants. We’ll get back to you with the next steps.
          </p>
          <Button asChild>
            <a href="mailto:roomroster07@gmail.com?subject=Create%20an%20event%20on%20RoomRoster">
              Email RoomRoster
            </a>
          </Button>
          <p className="admin-mail-help">
            <a className="text-link" href="mailto:roomroster07@gmail.com">
              roomroster07@gmail.com
            </a>
          </p>
          <Link className="text-link" to="/admin">
            Organizer? Sign in here →
          </Link>
        </Paper>
      </main>
      <Footer />
    </div>
  );
}
function CreateEvent() {
  const nav = useNavigate();
  const [details, set] = useState({
    ...eventDefault,
    name: "",
    subtitle: "",
    description: "",
    location: "",
    start: "",
    end: "",
  });
  const [message, msg] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (details.end < details.start) {
      msg("The end date must follow the start date.");
      return;
    }
    setBusy(true);
    try {
      const r = await api("create-event", { details });
      if (r.slug) nav(`/e/${r.slug}`);
      else msg(r.message);
    } catch (e) {
      msg((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="shell">
      <header>
        <Logo />
        <Link to="/">Back to rooms</Link>
      </header>
      <main id="main" className="form-page">
        <span className="eyebrow">A NEW PAGE, A NEW GATHERING</span>
        <h1>
          Make room for
          <br />
          <span className="highlight">your people.</span>
        </h1>
        <p>Create a directory that feels like part of your event.</p>
        <Paper stock="card" className="form-paper">
          <form onSubmit={submit}>
            <Field label="Event name">
              <Input
                required
                maxLength={100}
                value={details.name}
                onChange={(e) => set({ ...details, name: e.target.value })}
              />
            </Field>
            <Field label="A short introduction">
              <Input
                required
                maxLength={180}
                value={details.subtitle}
                onChange={(e) => set({ ...details, subtitle: e.target.value })}
              />
            </Field>
            <Field label="About your event">
              <Textarea
                required
                maxLength={1200}
                value={details.description}
                onChange={(e) =>
                  set({ ...details, description: e.target.value })
                }
              />
            </Field>
            <Field label="Location">
              <Input
                required
                maxLength={100}
                value={details.location}
                onChange={(e) => set({ ...details, location: e.target.value })}
              />
            </Field>
            <div className="form-row">
              <Field label="Starts">
                <Input
                  required
                  type="date"
                  value={details.start}
                  onChange={(e) => set({ ...details, start: e.target.value })}
                />
              </Field>
              <Field label="Ends">
                <Input
                  required
                  type="date"
                  min={details.start}
                  value={details.end}
                  onChange={(e) => set({ ...details, end: e.target.value })}
                />
              </Field>
            </div>
            <p className="micro">
              Created under your RoomRoster administrator account.
            </p>
            {message && (
              <p role="status" className="notice">
                {message}
              </p>
            )}
            <Button disabled={busy} type="submit">
              {busy ? "Preparing your room…" : "Create event directory"}
              <ArrowRight size={16} />
            </Button>
          </form>
        </Paper>
      </main>
      <Footer />
    </div>
  );
}
function EventRoute() {
  const { slug } = useParams();
  return <EventApp key={slug} />;
}
function EventApp() {
  const { slug = "" } = useParams();
  const loc = useLocation();
  const nav = useNavigate();
  const base = `/e/${slug}`;
  const page = loc.pathname.slice(base.length) || "/";
  const [data, setData] = useState<Data>();
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [actionError, setActionError] = useState("");
  const [access, setAccess] = useState(false);
  const pendingKey = `roomroster-pending:${slug}`;
  const [pendingLogin, setPendingLogin] = useState<{
    email: string;
    codeSent: boolean;
  } | null>(() => {
    try {
      const email = sessionStorage.getItem(pendingKey);
      return email ? { email, codeSent: true } : null;
    } catch {
      return null;
    }
  });
  const [selected, select] = useState<Profile>();
  const [recommend, setRecommend] = useState(false);
  const [matchingBusy, setMatchingBusy] = useState(false);
  const [onboarded, setOnboarded] = useState<Profile>();
  const [smartMatches, setSmartMatches] = useState<
    ReturnType<typeof rankProfiles>
  >([]);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try {
      setData(await api<Data>("load", { event: slug }));
      setError("");
    } catch (e) {
      setError((e as Error).message);
      throw e;
    }
  }, [slug]);
  useEffect(() => {
    load().catch(() => {});
  }, [load]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 6000);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => {
    if (data && page.startsWith("/people/"))
      select(data.profiles.find((p) => p.id === page.split("/")[2]));
  }, [data, page]);
  useEffect(() => {
    setActionError("");
  }, [selected?.id]);
  async function action(name: string, body: Record<string, any> = {}) {
    setBusy(true);
    setActionError("");
    try {
      const r = await api(name, { event: slug, ...body });
      await load();
      return r;
    } catch (e) {
      setActionError((e as Error).message);
      setToast((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    const user = data?.me || onboarded;
    if (!recommend || !user || !data) return;
    const query = [...user.needs, user.needText].join(" ").trim();
    if (!query) {
      setSmartMatches([]);
      return;
    }
    setSmartMatches(rankProfiles(query, data.profiles, user.id).slice(0, 3));
    let active = true;
    setMatchingBusy(true);
    api("search", { event: slug, query, self: user.id, useAI: user.aiConsent })
      .then((r) => {
        if (active) setSmartMatches(r.matches.slice(0, 3));
      })
      .catch(() => {})
      .finally(() => {
        if (active) setMatchingBusy(false);
      });
    return () => {
      active = false;
    };
  }, [recommend, data, onboarded, slug]);
  if (!data)
    return (
      <main id="main" className="standalone">
        <Logo />
        <div role="status" className="loading-room">
          {error ? (
            <p>{error}</p>
          ) : (
            <>
              <LoaderCircle className="loading-spin" size={28} />
              <p>Opening your room…</p>
              <div className="skeleton-cards" aria-hidden="true">
                <span />
                <span />
                <span />
              </div>
            </>
          )}
        </div>
        {error && (
          <Button onClick={() => load().catch(() => {})}>Try again</Button>
        )}
      </main>
    );
  const event = data.event;
  if (!event)
    return (
      <main id="main" className="standalone">
        <Logo />
        <h1>This room isn’t here.</h1>
        <Link to="/">Find another event</Link>
      </main>
    );
  const me = data.me;
  const matchUser = me || onboarded;
  const matches = smartMatches;
  const pending = data.connections.filter(
    (c) => c.to === me?.id && c.status === "pending",
  ).length;
  async function connect(p: Profile) {
    if (!me) {
      select(undefined);
      setAccess(true);
      return;
    }
    if (p.id === me.id) {
      nav(base + "/profile");
      select(undefined);
      return;
    }
    if (await action("connect", { to: p.id }))
      setToast(
        DEMO
          ? "Request saved in preview. No email was sent."
          : "Request sent. They can accept in their connections.",
      );
  }
  return (
    <div className="shell">
      <header>
        <Logo />
        <div className="header-right">
          <span className="event-pill">{event.name}</span>
          {me ? (
            <>
              <Link
                className="notification"
                to={base + "/connections"}
                aria-label={`Connections, ${pending} pending`}
              >
                <Bell size={20} />
                {pending > 0 && <span>{pending}</span>}
              </Link>
              <Link
                className="mini-avatar"
                to={base + "/profile"}
                aria-label="Edit your profile"
              >
                {initials(me.name)}
              </Link>
            </>
          ) : (
            <button className="text-link" onClick={() => setAccess(true)}>
              Sign in <ArrowUpRight size={14} />
            </button>
          )}
        </div>
      </header>
      <nav className="event-nav" aria-label="Event navigation">
        <Link className={page === "/" ? "active" : ""} to={base}>
          Event
        </Link>
        <Link
          className={page === "/directory" ? "active" : ""}
          to={base + "/directory"}
        >
          People <span>{data.profiles.length}</span>
        </Link>
        {me && (
          <Link
            className={page === "/connections" ? "active" : ""}
            to={base + "/connections"}
          >
            Connections
          </Link>
        )}
        {data.admin && <Link to={base + "/organizer"}>Organizer</Link>}
      </nav>
      <main id="main" tabIndex={-1}>
        {!me && pendingLogin && (
          <div className="notice pending-sign-in">
            <span>Your profile is saved. Sign in to connect or edit.</span>
            <button className="text-link" onClick={() => setAccess(true)}>
              Enter email code <ArrowRight size={16} />
            </button>
          </div>
        )}
        {error && (
          <p className="notice" role="alert">
            {error}{" "}
            <button
              className="text-link"
              onClick={() => load().catch(() => {})}
            >
              Refresh
            </button>
          </p>
        )}
        {page === "/" && (
          <>
            <section className="event-hero">
              <div>
                <span className="eyebrow">
                  <span className="live-dot" /> YOUR EVENT. YOUR PEOPLE.
                </span>
                <h1>
                  Big ideas start
                  <br />
                  with a little
                  <br />
                  <span className="highlight">“hello.”</span>
                  <span className="hero-star">✳</span>
                </h1>
                <p className="hero-description">
                  Meet the people growing something new.
                  <br />
                  Find a collaborator, share what you know,
                  <br />
                  and make this gathering count.
                </p>
                <div className="hero-actions">
                  <Button size="lg" asChild>
                    <Link to={base + (me ? "/directory" : "/join")}>
                      {me
                        ? "Meet your fellow participants"
                        : "Find your people"}
                      <ArrowRight size={18} />
                    </Link>
                  </Button>
                  <span className="hand-note">
                    good connections
                    <br />
                    start here ↗
                  </span>
                </div>
                <p className="micro">
                  No passwords. No long introductions. Just you.
                </p>
              </div>
              <div className="hero-board">
                <Paper stock="card" tape="top" className="event-ticket">
                  <span className="eyebrow">YOU’RE IN THE RIGHT ROOM</span>
                  <Leaf className="ticket-leaf" size={42} strokeWidth={1.3} />
                  <h2>{event.name}</h2>
                  <p>{event.subtitle}</p>
                  <div className="ticket-details">
                    <span>
                      <CalendarDays size={17} />
                      <DateRange event={event} />
                    </span>
                    <span>
                      <MapPin size={17} />
                      {event.location}
                    </span>
                  </div>
                  <div className="ticket-bottom">
                    <span>IDEAS GROW BETTER TOGETHER</span>
                    <span>✳</span>
                  </div>
                </Paper>
                <Paper stock="card" className="small-note">
                  <span className="scribble">
                    Your next collaborator
                    <br />
                    might be one card away.
                  </span>
                  <ArrowUpRight size={30} />
                </Paper>
                <span className="board-doodle">✺</span>
              </div>
            </section>
            <section className="gathering-strip">
              <div className="avatar-stack">
                {data.profiles.slice(0, 4).map((p) => (
                  <Avatar key={p.id} p={p} />
                ))}
              </div>
              <p>
                <strong>
                  {data.profiles.length} people. A whole lot of possibility.
                </strong>
                <br />
                Founders, builders, researchers, and people like you.
              </p>
              <Link className="text-link" to={base + "/directory"}>
                Take a look around <ArrowRight size={17} />
              </Link>
            </section>
            <div className="section-title">
              <div>
                <span className="eyebrow">A FEW FACES IN THE ROOM</span>
                <h2>Different skills. Shared curiosity.</h2>
              </div>
              <Link className="text-link" to={base + "/directory"}>
                Meet everyone <ArrowRight size={16} />
              </Link>
            </div>
            <div className="profile-grid preview-grid">
              {data.profiles.slice(0, 3).map((p) => (
                <ProfileCard
                  key={p.id}
                  p={p}
                  isSelf={p.id === me?.id}
                  open={() => select(p)}
                />
              ))}
            </div>
            <section className="about-event">
              <span className="eyebrow">ABOUT THE GATHERING</span>
              <h2>A place for ideas to take root.</h2>
              <p>{event.description}</p>
              <small>
                Participant-created directory. Independent of the event
                organizers.
              </small>
            </section>
          </>
        )}
        {page === "/profile" && !me ? (
          <section className="form-page">
            <h1>Your profile is waiting.</h1>
            <p>Sign in with the email you joined with.</p>
            <Paper stock="card" className="form-paper">
              <ParticipantLogin
                event={slug}
                initialEmail={pendingLogin?.email}
                onAuthenticated={async () => {
                  await load();
                  setPendingLogin(null);
                  sessionStorage.removeItem(pendingKey);
                }}
                onJoin={() => nav(base + "/join")}
              />
            </Paper>
          </section>
        ) : (
          (page === "/join" || page === "/profile") && (
            <Onboarding
              key={me?.id || "new"}
              event={event}
              existing={me}
              onSignIn={() => setAccess(true)}
              closed={event.closed}
              onComplete={async (p) => {
                let r;
                try {
                  r = await api(me ? "update" : "register", {
                    event: slug,
                    profile: p,
                  });
                } catch (e) {
                  if ((e as { code?: string }).code === "PROFILE_EXISTS") {
                    setPendingLogin({ email: p.email, codeSent: false });
                    setAccess(true);
                  }
                  throw e;
                }
                if (r.verificationRequired) {
                  try {
                    sessionStorage.setItem(pendingKey, p.email);
                  } catch {}
                  setPendingLogin({ email: p.email, codeSent: !!r.codeSent });
                  setAccess(true);
                  await load();
                  nav(base + "/directory");
                } else {
                  await load();
                  nav(base + "/directory");
                  if (!me) {
                    setOnboarded({
                      ...p,
                      id: r.id,
                      event: slug,
                      joined: new Date().toISOString(),
                    });
                    setRecommend(true);
                  } else setToast("Your profile is updated.");
                }
                return r;
              }}
            />
          )
        )}
        {(page === "/directory" || page.startsWith("/people/")) && (
          <Directory
            data={data}
            open={select}
            recommend={() => setRecommend(true)}
            join={() => nav(base + "/join")}
          />
        )}
        {page === "/connections" && (
          <section className="content-page">
            <span className="eyebrow">A HELLO IS JUST THE BEGINNING</span>
            <h1>My connections</h1>
            <p>Contact details are shared only after a request is accepted.</p>
            {!me ? (
              <Button onClick={() => setAccess(true)}>
                Return to your profile
              </Button>
            ) : (
              <>
                {!data.connections.length && (
                  <Paper className="empty" stock="card">
                    <Handshake size={38} />
                    <h2>Your next hello is waiting.</h2>
                    <p>Find someone you’d like to meet in the directory.</p>
                    <Button asChild>
                      <Link to={base + "/directory"}>Explore people</Link>
                    </Button>
                  </Paper>
                )}
                {data.connections.map((c) => {
                  const p = data.profiles.find(
                    (p) => p.id === (c.from === me.id ? c.to : c.from),
                  );
                  return (
                    <Paper key={c.id} stock="card" className="connection">
                      <div>
                        <h3>{p?.name || "Former attendee"}</h3>
                        <p>
                          {c.status === "pending"
                            ? c.to === me.id
                              ? "Would like to connect with you."
                              : "Your invitation is on its way."
                            : c.status === "accepted"
                              ? "You’re connected. Say hello!"
                              : "Request declined."}
                        </p>
                        {c.status === "accepted" && (
                          <p>
                            {c.email ? (
                              <a href={`mailto:${c.email}`}>{c.email}</a>
                            ) : DEMO ? (
                              "Sample contact details are not shared in preview."
                            ) : (
                              ""
                            )}
                            {c.phone && (
                              <>
                                {" "}
                                · <a href={`tel:${c.phone}`}>{c.phone}</a>
                              </>
                            )}
                          </p>
                        )}
                      </div>
                      {c.status === "pending" && c.to === me.id ? (
                        <div className="inline-actions">
                          <Button
                            disabled={busy}
                            onClick={() =>
                              action("respond", { id: c.id, accept: true })
                            }
                          >
                            Accept & share contact
                          </Button>
                          <Button
                            variant="ghost"
                            disabled={busy}
                            onClick={() =>
                              action("respond", { id: c.id, accept: false })
                            }
                          >
                            Decline
                          </Button>
                        </div>
                      ) : (
                        <span className="tag">{c.status}</span>
                      )}
                    </Paper>
                  );
                })}
                <Button
                  variant="ghost"
                  onClick={async () => {
                    await action("logout");
                    nav(base);
                  }}
                >
                  <LogOut size={16} />
                  Leave this session
                </Button>
              </>
            )}
          </section>
        )}
        {page === "/organizer" && (
          <Organizer data={data} action={action} busy={busy} />
        )}
      </main>
      <div className="event-credit">
        Participant-created directory · {event.name} · Powered by RoomRoster
      </div>
      <Footer />
      {toast && (
        <div role="status" className="toast">
          {toast}
        </div>
      )}
      {selected && (
        <Modal
          title={selected.name}
          description={`${selected.startup} · ${selected.location}`}
          close={() => {
            select(undefined);
            if (page.startsWith("/people/")) nav(base + "/directory");
          }}
        >
          <div className="detail-head">
            <Avatar p={selected} large />
            <p>{selected.bio}</p>
          </div>
          <div className="detail-section">
            <small>CAN HELP WITH</small>
            <div className="chips">
              {selected.offers.map((r) => (
                <span className="tag" key={r}>
                  {r}
                </span>
              ))}
            </div>
            <p>{selected.offerText || "No additional details yet."}</p>
          </div>
          <div className="detail-section">
            <small>WOULD LIKE TO MEET</small>
            <div className="chips">
              {selected.needs.map((r) => (
                <span className="tag pink" key={r}>
                  {r}
                </span>
              ))}
            </div>
            <p>{selected.needText || "Open to meeting fellow participants."}</p>
          </div>
          <div className="inline-actions">
            {selected.website && (
              <a href={selected.website} target="_blank" rel="noreferrer">
                <Globe size={16} />
                Website
              </a>
            )}
            {selected.linkedin && (
              <a href={selected.linkedin} target="_blank" rel="noreferrer">
                <LinkIcon size={16} />
                LinkedIn
              </a>
            )}
            <button
              className="text-link"
              onClick={() =>
                navigator.clipboard
                  .writeText(location.origin + base + "/people/" + selected.id)
                  .then(() => setToast("Profile link copied."))
                  .catch(() =>
                    setToast(
                      "Could not copy. Open the profile URL to share it.",
                    ),
                  )
              }
            >
              <Copy size={15} />
              Copy link
            </button>
          </div>
          {actionError && (
            <p className="notice" role="alert">
              {actionError}
            </p>
          )}
          {selected.id !== me?.id && (
            <Button
              disabled={
                busy ||
                !!data.connections.find((c) =>
                  [c.from, c.to].includes(selected.id),
                )
              }
              onClick={() => connect(selected)}
            >
              {busy ? (
                <LoaderCircle className="loading-spin" size={17} />
              ) : (
                <Handshake size={17} />
              )}
              {busy
                ? "Sending request…"
                : data.connections.find((c) =>
                      [c.from, c.to].includes(selected.id),
                    )?.status === "accepted"
                  ? "Connected"
                  : data.connections.find((c) =>
                        [c.from, c.to].includes(selected.id),
                      )
                    ? "Request recorded"
                    : "Request to connect"}
            </Button>
          )}
          {selected.id === me?.id ? (
            <Button
              onClick={() => {
                select(undefined);
                nav(base + "/profile");
              }}
            >
              Edit my profile
            </Button>
          ) : (
            <small>Contact details are shared only after acceptance.</small>
          )}
        </Modal>
      )}
      {recommend && (
        <Modal
          title="A few people worth saying hello to."
          description={`Selected from ${event.name}, based on what you’re looking for.`}
          close={() => setRecommend(false)}
        >
          {!DEMO && onboarded && !me && (
            <p className="notice">
              Your profile is ready. Check your welcome email to confirm
              ownership before connecting or editing.
            </p>
          )}
          {matchingBusy && (
            <p role="status" className="inline-actions">
              <LoaderCircle className="loading-spin" size={18} /> Finding your
              people…
            </p>
          )}
          {matches.length
            ? matches.map((m) => (
                <button
                  className="match-row"
                  key={m.profile.id}
                  onClick={() => {
                    setRecommend(false);
                    select(m.profile);
                  }}
                >
                  <Avatar p={m.profile} />
                  <span>
                    <strong>{m.profile.name}</strong>
                    <small>{m.reason}</small>
                  </span>
                  <ArrowUpRight size={20} />
                </button>
              ))
            : !matchingBusy && (
                <div className="empty">
                  <Sparkles size={30} />
                  <p>
                    {matchUser?.needs.length || matchUser?.needText
                      ? "No close matches yet. We can let you know when someone relevant joins."
                      : "Add what you’re looking for to your profile to see useful introductions."}
                  </p>
                </div>
              )}
          <Button variant="outline" onClick={() => setRecommend(false)}>
            Explore the directory <ArrowRight size={16} />
          </Button>
        </Modal>
      )}
      {access && (
        <Modal
          title={pendingLogin ? "One last step." : "Welcome back."}
          description="Sign in with a code sent to your email."
          close={() => setAccess(false)}
        >
          <ParticipantLogin
            event={slug}
            initialEmail={pendingLogin?.email}
            initialCodeSent={pendingLogin?.codeSent}
            onAuthenticated={async () => {
              await load();
              const isNew = !!pendingLogin;
              setPendingLogin(null);
              setAccess(false);
              setOnboarded(undefined);
              try {
                sessionStorage.removeItem(pendingKey);
              } catch {}
              nav(base + "/directory");
              if (isNew) setRecommend(true);
              else setToast("Welcome back. You’re signed in.");
            }}
            onJoin={() => {
              setAccess(false);
              nav(base + "/join");
            }}
          />
        </Modal>
      )}
    </div>
  );
}
function Directory({
  data,
  open,
  recommend,
  join,
}: {
  data: Data;
  open: (p: Profile) => void;
  recommend: () => void;
  join: () => void;
}) {
  const [q, setQ] = useState("");
  const [searched, setSearched] = useState("");
  const [filter, setFilter] = useState("All sectors");
  const [sort, setSort] = useState("name");
  const [results, setResults] = useState<ReturnType<
    typeof rankProfiles
  > | null>(null);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState("");
  const [error, setError] = useState("");
  const [suggest, setSuggest] = useState(false);
  const event = data.event!;
  async function search(e?: FormEvent) {
    e?.preventDefault();
    setSuggest(false);
    setLoading(true);
    setError("");
    try {
      const r = await api("search", {
        event: event.slug,
        query: q,
        self: data.me?.id,
        useAI: data.me?.aiConsent ?? false,
      });
      setResults(r.matches);
      setMode(r.mode);
      setSearched(q);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  let list = (
    results ||
    data.profiles.map((profile) => ({ profile, score: 0, reason: "" }))
  ).filter((x) => filter === "All sectors" || x.profile.sector === filter);
  if (!searched)
    list = [...list].sort((a, b) =>
      sort === "newest"
        ? b.profile.joined.localeCompare(a.profile.joined)
        : a.profile.name.localeCompare(b.profile.name),
    );
  const suggestions = q.trim()
    ? rankProfiles(q, data.profiles, data.me?.id).slice(0, 3)
    : [];
  return (
    <section className="directory">
      <div className="directory-title">
        <div>
          <span className="eyebrow">{event.name}</span>
          <h1>
            Your people are <span className="highlight">in here.</span>
          </h1>
          <p>Find someone who can help with your next step.</p>
        </div>
        <span className="directory-doodle">
          hello!<span>↙</span>
        </span>
      </div>
      <div className="search-area">
        <form className="search-box" onSubmit={search}>
          <Search size={23} />
          <input
            aria-label="Search people, skills, or describe what you need"
            placeholder="Try “someone to build my farm’s website”"
            value={q}
            onFocus={() => setSuggest(true)}
            onChange={(e) => {
              setQ(e.target.value);
              setSuggest(true);
              if (!e.target.value) {
                setResults(null);
                setSearched("");
              }
            }}
            onKeyDown={(e) => e.key === "Escape" && setSuggest(false)}
            maxLength={400}
          />
          <Button type="submit" disabled={loading}>
            {loading ? (
              <LoaderCircle className="loading-spin" size={16} />
            ) : (
              <Sparkles size={16} />
            )}
            <span>{loading ? "Finding…" : "Find people"}</span>
          </Button>
        </form>
        {suggest && suggestions.length > 0 && (
          <div className="search-suggestions">
            {suggestions.map((m) => (
              <button
                key={m.profile.id}
                onClick={() => {
                  setSuggest(false);
                  open(m.profile);
                }}
              >
                <span>
                  {m.profile.name}
                  <small>{m.profile.offers.join(" · ")}</small>
                </span>
                <ArrowUpRight size={16} />
              </button>
            ))}
          </div>
        )}
        <p className="search-hint">
          Search a name, skill, or something you need.
        </p>
      </div>
      <div className="directory-toolbar">
        <div className="filter-scroll">
          {sectors.map((s) => (
            <button
              key={s}
              className={`filter ${filter === s ? "active" : ""}`}
              aria-pressed={filter === s}
              onClick={() => setFilter(s)}
            >
              {s}
            </button>
          ))}
        </div>
        <div className="toolbar-bottom">
          <span>
            {list.length} {list.length === 1 ? "person" : "people"}
            {searched && ` matching “${searched}”`}
          </span>
          <div className="inline-actions">
            {data.me ? (
              <button className="text-link" onClick={recommend}>
                <Sparkles size={16} />
                For you
              </button>
            ) : (
              <button className="text-link" onClick={join}>
                Add your profile <Plus size={16} />
              </button>
            )}
            <label className="sort">
              <SlidersHorizontal size={15} />
              <select
                aria-label="Sort people"
                value={sort}
                onChange={(e) => setSort(e.target.value)}
              >
                <option value="name">Name A–Z</option>
                <option value="newest">Newest first</option>
              </select>
            </label>
          </div>
        </div>
      </div>
      {error && (
        <p role="alert" className="notice">
          {error}
        </p>
      )}
      {searched && (
        <p className="search-hint">
          {mode === "gemini"
            ? "AI-ranked suggestions"
            : "Skill and keyword matches"}{" "}
          ·{" "}
          <button
            className="text-link"
            onClick={() => {
              setQ("");
              setResults(null);
              setSearched("");
            }}
          >
            Clear search
          </button>
        </p>
      )}
      <div className="profile-grid">
        {list.map((m) => (
          <ProfileCard
            key={m.profile.id}
            p={m.profile}
            isSelf={m.profile.id === data.me?.id}
            open={() => open(m.profile)}
            reason={searched ? m.reason : undefined}
          />
        ))}
      </div>
      {!list.length && (
        <Paper stock="card" className="empty">
          <Search size={36} />
          <h2>A little more room to grow.</h2>
          <p>No matches yet. Try another skill or clear your filters.</p>
          <Button
            variant="outline"
            onClick={() => {
              setFilter("All sectors");
              setQ("");
              setResults(null);
              setSearched("");
            }}
          >
            Show everyone
          </Button>
        </Paper>
      )}
      <div className="directory-bottom">
        <span>✳</span>
        <p>
          Every person here has something to offer.
          <br />
          Sometimes all it takes is a hello.
        </p>
      </div>
    </section>
  );
}
function Onboarding({
  event,
  existing,
  onComplete,
  closed,
  onSignIn,
}: {
  onSignIn: () => void;
  event: EventInfo;
  existing?: Profile;
  closed?: boolean;
  onComplete: (p: any) => Promise<any>;
}) {
  const [p, set] = useState({ ...blankProfile(), ...existing });
  const [step, next] = useState(1);
  const [error, err] = useState("");
  const [busy, setBusy] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const photoId = useId();
  const setField = (k: string, v: any) => set((prev) => ({ ...prev, [k]: v }));
  async function photo(file?: File) {
    if (!file) return;
    if (
      !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
      file.size > 5 * 1024 * 1024
    ) {
      err("Choose a JPG, PNG, or WebP image under 5 MB.");
      return;
    }
    setPhotoBusy(true);
    try {
      const img = await createImageBitmap(file);
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 320;
      const ctx = canvas.getContext("2d")!;
      const side = Math.min(img.width, img.height);
      ctx.drawImage(
        img,
        (img.width - side) / 2,
        (img.height - side) / 2,
        side,
        side,
        0,
        0,
        320,
        320,
      );
      img.close();
      setField("photo", canvas.toDataURL("image/jpeg", 0.8));
      err("");
    } catch {
      err("Could not read that photo. Please try another.");
    } finally {
      setPhotoBusy(false);
    }
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (step === 1) {
      next(2);
      window.scrollTo(0, 0);
      return;
    }
    setBusy(true);
    err("");
    try {
      await onComplete(p);
    } catch (e) {
      err((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="form-page">
      <Link className="text-link" to={`/e/${event.slug}/directory`}>
        <ArrowLeft size={15} />
        Back to directory
      </Link>
      {!existing && (
        <button
          type="button"
          className="text-link returning-link"
          onClick={onSignIn}
        >
          Sign in instead
        </button>
      )}
      <div className="step-label">
        <span className={step === 1 ? "current" : ""}>01 · About you</span>
        <span>—</span>
        <span className={step === 2 ? "current" : ""}>02 · Your people</span>
      </div>
      <h1>
        {existing
          ? "Make it feel like you."
          : step === 1
            ? "Let’s get to know you."
            : "Find your kind of people."}
      </h1>
      <p>
        {step === 1
          ? "Help people put a face to a name."
          : "Pick a few roles, add your own words, or skip these for now."}
      </p>
      <Paper stock="card" className="form-paper">
        <form onSubmit={submit}>
          {step === 1 ? (
            <>
              <div className="photo-field">
                <label
                  className="photo-upload"
                  htmlFor={photoId}
                  aria-busy={photoBusy}
                >
                  <span className="avatar large">
                    {p.photo ? (
                      <img src={p.photo} alt="Your uploaded photo" />
                    ) : (
                      <Camera size={30} aria-hidden="true" />
                    )}
                  </span>
                  <span>
                    <strong>
                      {photoBusy
                        ? "Preparing photo…"
                        : p.photo
                          ? "Change your photo"
                          : "Add your photo"}
                    </strong>
                    <small>Optional · JPG, PNG or WebP · up to 5 MB</small>
                  </span>
                  {photoBusy ? (
                    <LoaderCircle className="loading-spin" size={22} />
                  ) : (
                    <Upload size={22} aria-hidden="true" />
                  )}
                  <input
                    id={photoId}
                    className="photo-file-input"
                    aria-label="Upload founder photo"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    disabled={photoBusy}
                    onChange={(e) => {
                      photo(e.target.files?.[0]);
                      e.target.value = "";
                    }}
                  />
                </label>
                {p.photo && (
                  <button
                    className="text-link"
                    type="button"
                    disabled={photoBusy}
                    onClick={() => setField("photo", "")}
                  >
                    Remove photo
                  </button>
                )}
              </div>
              <div className="form-row">
                <Field label="What should we call you?">
                  <Input
                    required
                    maxLength={70}
                    autoComplete="name"
                    value={p.name}
                    onChange={(e) => setField("name", e.target.value)}
                    placeholder="Your preferred name"
                  />
                </Field>
                <Field
                  label="Your email"
                  hint="Private until a connection is accepted."
                >
                  <Input
                    required
                    type="email"
                    autoComplete="email"
                    disabled={!!existing}
                    value={p.email}
                    onChange={(e) => setField("email", e.target.value)}
                    placeholder="you@example.com"
                  />
                </Field>
              </div>
              <Field label="Startup or project name">
                <Input
                  required
                  maxLength={100}
                  value={p.startup}
                  onChange={(e) => setField("startup", e.target.value)}
                  placeholder="An idea in progress counts, too"
                />
              </Field>
              <Field
                label="What are you building?"
                hint={`${p.bio.length}/240 characters`}
              >
                <Textarea
                  required
                  maxLength={240}
                  value={p.bio}
                  onChange={(e) => setField("bio", e.target.value)}
                  placeholder="One or two sentences, in your own words."
                />
              </Field>
              <div className="form-row">
                <Field label="Where are you based?">
                  <Input
                    required
                    maxLength={100}
                    value={p.location}
                    onChange={(e) => setField("location", e.target.value)}
                    placeholder="City or region"
                  />
                </Field>
                <Field label="Your field">
                  <select
                    value={p.sector}
                    onChange={(e) => setField("sector", e.target.value)}
                  >
                    {sectors.slice(1).map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </Field>
              </div>
              <details>
                <summary>
                  A few optional extras <Plus size={16} />
                </summary>
                <Field label="Website">
                  <Input
                    type="url"
                    maxLength={500}
                    value={p.website}
                    placeholder="https://your-startup.com"
                    onChange={(e) => setField("website", e.target.value)}
                  />
                </Field>
                <Field
                  label="LinkedIn URL"
                  hint="Optional — no LinkedIn needed."
                >
                  <Input
                    type="url"
                    maxLength={500}
                    value={p.linkedin}
                    placeholder="https://www.linkedin.com/in/your-name"
                    onChange={(e) => setField("linkedin", e.target.value)}
                  />
                </Field>
                <Field
                  label="Phone (optional)"
                  hint="Shared only with accepted connections."
                >
                  <Input
                    type="tel"
                    maxLength={30}
                    value={p.phone}
                    onChange={(e) => setField("phone", e.target.value)}
                  />
                </Field>
              </details>
            </>
          ) : (
            <>
              <RolePicker
                label="Who would you like to meet?"
                values={p.needs}
                set={(v) => setField("needs", v)}
              />
              <Field label="Anything specific you’d like help with? (optional)">
                <Textarea
                  maxLength={800}
                  value={p.needText}
                  onChange={(e) => setField("needText", e.target.value)}
                  placeholder="For example: someone to build an online store for our organic produce."
                />
              </Field>
              <hr />
              <RolePicker
                label="What can others come to you for?"
                values={p.offers}
                set={(v) => setField("offers", v)}
              />
              <Field label="Tell us a little more about what you offer (optional)">
                <Textarea
                  maxLength={800}
                  value={p.offerText}
                  onChange={(e) => setField("offerText", e.target.value)}
                  placeholder="For example: I can help with soil testing and crop nutrition."
                />
              </Field>
              <label className="check-line">
                <input
                  type="checkbox"
                  checked={p.alerts}
                  onChange={(e) => setField("alerts", e.target.checked)}
                />
                <span>
                  Send me event updates and matches.
                  <small>
                    At 1 PM and 9:30 PM India time. Unsubscribe anytime.
                  </small>
                </span>
              </label>
              <label className="check-line">
                <input
                  type="checkbox"
                  checked={p.aiConsent}
                  onChange={(e) => setField("aiConsent", e.target.checked)}
                />
                <span>
                  Use my profile text for AI-assisted matching (optional).
                  <small>
                    Skills and descriptions may be sent to Google Gemini.
                    Free-tier data may be used to improve Google products. Your
                    email, phone, and photo are excluded. Keyword matching works
                    without this.
                  </small>
                </span>
              </label>
              <p className="micro">
                Your profile is visible to people with this event’s link.
                Contact details stay private until you accept a connection.
              </p>
            </>
          )}
          {error && (
            <p role="alert" className="notice">
              {error}
            </p>
          )}
          {closed && (
            <p role="alert">This directory is closed for new registrations.</p>
          )}
          <div className="form-actions">
            {step === 2 && (
              <Button type="button" variant="ghost" onClick={() => next(1)}>
                <ArrowLeft size={16} />
                Back
              </Button>
            )}
            <Button
              type="submit"
              disabled={busy || photoBusy || (!existing && closed)}
            >
              {busy && <LoaderCircle className="loading-spin" size={17} />}
              {busy
                ? "Saving your profile…"
                : step === 1
                  ? "Next: find your people"
                  : existing
                    ? "Save my profile"
                    : "Join the room"}
              <ArrowRight size={17} />
            </Button>
          </div>
        </form>
      </Paper>
    </section>
  );
}
function Organizer({
  data,
  action,
  busy,
}: {
  data: Data;
  action: (s: string, b?: Record<string, any>) => Promise<any>;
  busy: boolean;
}) {
  const [e, set] = useState(data.event!);
  const [remove, ask] = useState<Profile>();
  const [msg, notify] = useState("");
  if (!data.admin)
    return (
      <section className="content-page">
        <h1>Organizer access</h1>
        <p>
          <Link to="/admin">Sign in to the admin dashboard</Link> to manage this
          event.
        </p>
      </section>
    );
  return (
    <section className="content-page">
      <span className="eyebrow">THE HOST’S NOTEBOOK</span>
      <h1>Your room, at a glance.</h1>
      <div className="stats">
        <Paper className="stat" stock="card">
          <strong>{data.profiles.length}</strong> participants
        </Paper>
        <Paper className="stat" stock="card">
          <strong>
            {data.connections.filter((c) => c.status === "accepted").length}
          </strong>{" "}
          accepted connections{!DEMO && <small>Shown in your account</small>}
        </Paper>
      </div>
      <Paper stock="card" className="form-paper">
        <form
          onSubmit={async (ev) => {
            ev.preventDefault();
            if (await action("event-update", { details: e }))
              notify("Event updated.");
          }}
        >
          <Field label="Event name">
            <Input
              required
              value={e.name}
              onChange={(v) => set({ ...e, name: v.target.value })}
            />
          </Field>
          <Field label="Event introduction">
            <Textarea
              required
              value={e.description}
              onChange={(v) => set({ ...e, description: v.target.value })}
            />
          </Field>
          <label className="check-line">
            <input
              type="checkbox"
              checked={!!e.closed}
              onChange={(v) => set({ ...e, closed: v.target.checked })}
            />
            Close registrations and match alerts
          </label>
          <Button type="submit" disabled={busy}>
            Save event details <Check size={16} />
          </Button>
          {msg && <p role="status">{msg}</p>}
        </form>
      </Paper>
      <h2>Participants</h2>
      {data.profiles.map((p) => (
        <div className="organizer-row" key={p.id}>
          <span>
            {p.name} · {p.startup}
          </span>
          <Button variant="ghost" onClick={() => ask(p)}>
            Remove
          </Button>
        </div>
      ))}
      {remove && (
        <Modal
          title={`Remove ${remove.name}?`}
          description="This removes their event profile and connections. This cannot be undone."
          close={() => ask(undefined)}
        >
          <Button
            variant="destructive"
            disabled={busy}
            onClick={async () => {
              if (await action("remove", { id: remove.id })) ask(undefined);
            }}
          >
            Remove participant
          </Button>
        </Modal>
      )}
    </section>
  );
}
