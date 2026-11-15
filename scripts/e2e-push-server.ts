// Local end-to-end push harness (not shipped): serves the production build,
// accepts a real browser push subscription, then delivers a real push message
// through the push service using the exact server code.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { deliver, pushPublicKey } from "../server/push";

const DIST = new URL("../dist/", import.meta.url).pathname;
const MIME: Record<string, string> = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webmanifest": "application/manifest+json",
  ".json": "application/json",
};
let sub: any = null;

const page = `<!doctype html><title>push e2e</title><body>
<script type="module">
const out = (m) => { document.title = m; const d = document.createElement('pre'); d.id='result'; d.textContent = m; document.body.appendChild(d); };
try {
  const reg = await navigator.serviceWorker.register('/sw.js');
  await navigator.serviceWorker.ready;
  const key = (await (await fetch('/api/push-key')).json()).key;
  const pad = '='.repeat((4 - key.length % 4) % 4);
  const bin = atob((key + pad).replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  const s = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytes });
  const j = s.toJSON();
  await fetch('/api/push-subscribe', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(j) });
  const r = await fetch('/e2e/deliver', { method: 'POST' });
  out('DELIVERED status=' + r.status + ' endpoint=' + j.endpoint.slice(0, 40));
} catch (e) { out('FAILED: ' + (e && e.message)); }
</script></body>`;

createServer(async (req, res) => {
  const url = new URL(req.url || "/", "http://localhost");
  if (url.pathname === "/pushtest") {
    res.end(page);
    return;
  }
  if (url.pathname === "/api/load" && req.method === "POST") {
    // Canned signed-in state so the built app's notification prompt renders.
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        event: {
          slug: "manage-agri-eureka-2026",
          name: "MANAGE Agri-Eureka 2026",
          subtitle: "National-level Agri-Innovation and Business Plan Challenge",
          description: "Five days of ideas, field visits, and new possibilities.",
          location: "MANAGE, Hyderabad",
          start: "2026-11-10",
          end: "2026-11-14",
        },
        profiles: [],
        me: {
          id: "00000000-0000-4000-8000-000000000001",
          event: "manage-agri-eureka-2026",
          name: "Review User",
          startup: "Farm Lab",
          bio: "Reviewing the app",
          location: "Hyderabad",
          sector: "Agri-tech",
          needs: [],
          offers: [],
          needText: "",
          offerText: "",
          website: "",
          linkedin: "",
          photo: "",
          joined: new Date().toISOString(),
          email: "review@example.com",
          phone: "",
          verified: true,
        },
        connections: [],
        admin: false,
      }),
    );
    return;
  }
  if (url.pathname === "/api/push-key") {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ key: pushPublicKey() }));
    return;
  }
  if (url.pathname === "/api/push-subscribe" && req.method === "POST") {
    sub = JSON.parse(await new Promise((ok) => {
      let d = "";
      req.on("data", (c) => (d += c));
      req.on("end", () => ok(d));
    }));
    res.end("{}");
    return;
  }
  if (url.pathname === "/e2e/deliver" && req.method === "POST") {
    const status = await deliver(
      sub.endpoint,
      sub.keys.p256dh,
      sub.keys.auth,
      { title: "Test wants to connect", body: "e2e push body", url: "/" },
      process.env.VAPID_PUBLIC_KEY!,
      process.env.VAPID_PRIVATE_KEY!,
    );
    res.statusCode = status >= 200 && status < 300 ? 200 : 502;
    res.end(String(status));
    return;
  }
  try {
    const p = join(DIST, url.pathname === "/" ? "index.html" : url.pathname);
    const data = await readFile(p);
    res.setHeader("Content-Type", MIME[extname(p)] || "application/octet-stream");
    res.end(data);
  } catch {
    // SPA fallback for client-side routes like /e/<slug>
    try {
      const data = await readFile(join(DIST, "index.html"));
      res.setHeader("Content-Type", "text/html");
      res.end(data);
    } catch {
      res.statusCode = 404;
      res.end("nf");
    }
  }
}).listen(8899, () => console.log("e2e harness on http://localhost:8899"));
