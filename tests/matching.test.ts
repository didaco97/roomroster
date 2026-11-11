import { it, expect, vi, afterEach } from "vitest";
import { demoProfiles } from "../src/demo";
vi.mock("../server/db", () => ({
  db: () => async (strings: TemplateStringsArray) =>
    strings.join("").includes("limits") ? [{ count: 1 }] : [],
}));
import { match } from "../server/matching";
afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.GEMINI_API_KEY;
});
it('does not send automatic profile needs to AI when consent is off', async()=>{
  process.env.GEMINI_API_KEY='test-key'; const request=vi.fn(); vi.stubGlobal('fetch',request);
  const result=await match('website',demoProfiles.map(p=>({...p,aiConsent:true})),undefined,false);
  expect(result.mode).toBe('keyword'); expect(request).not.toHaveBeenCalled();
});
it("sends only consented professional text, validates returned IDs, and keeps contacts out of AI requests", async () => {
  process.env.GEMINI_API_KEY = "test-key";
  process.env.SESSION_SECRET = "x".repeat(40);
  let payload = "";
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url, options) => {
      payload = options.body;
      return new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify([
                      { id: "sample-1", score: 90 },
                      { id: "invented", score: 100 },
                      { id: "sample-0", score: 99 },
                    ]),
                  },
                ],
              },
            },
          ],
        }),
      );
    }),
  );
  const profiles = demoProfiles.map((p) => ({
    ...p,
    aiConsent: p.id === "sample-1",
    email: "private@example.com",
    phone: "1234567890",
  }));
  const result = await match("an online shop", profiles);
  expect(result.mode).toBe("gemini");
  expect(result.matches[0].profile.id).toBe("sample-1");
  expect(result.matches.some((m) => m.profile.id === "invented")).toBe(false);
  expect(payload).not.toContain("private@example.com");
  expect(payload).not.toContain("1234567890");
  expect(payload).not.toContain("sample-0");
});
it("falls back when Gemini has no quota", async () => {
  process.env.GEMINI_API_KEY = "test-key";
  process.env.SESSION_SECRET = "x".repeat(40);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("{}", { status: 429 })),
  );
  const result = await match(
    "website",
    demoProfiles.map((p) => ({ ...p, aiConsent: true })),
  );
  expect(result.mode).toBe("keyword");
  expect(result.matches[0].profile.name).toBe("Rohan Mehta");
});
