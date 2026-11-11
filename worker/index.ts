import api from "../netlify/functions/api";
import digest from "../server/digest";
import { flush } from "../server/mail";
type Env = { ASSETS: { fetch: (request: Request) => Promise<Response> } };
export default {
  async fetch(request: Request, env: Env) {
    const path = new URL(request.url).pathname;
    let response: Response;
    if (path.startsWith("/api/")) {
      const headers = new Headers(request.headers);
      // Cloudflare supplies this address. Ignore any caller-supplied Netlify header.
      headers.set(
        "x-nf-client-connection-ip",
        request.headers.get("CF-Connecting-IP") || "local",
      );
      response = await api(new Request(request, { headers }));
    } else response = await env.ASSETS.fetch(request);
    const out = new Response(response.body, response);
    out.headers.set("X-Content-Type-Options", "nosniff");
    out.headers.set("Referrer-Policy", "no-referrer");
    out.headers.set("X-Frame-Options", "DENY");
    return out;
  },
  async scheduled(controller: { cron: string }) {
    if (controller.cron === "30 5,11 * * *") await digest();
    else await flush(50);
  },
};
