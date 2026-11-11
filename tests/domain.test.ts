import { describe, it, expect } from "vitest";
import { rankProfiles, canSend, indiaDay } from "../src/domain";
import { demoProfiles } from "../src/demo";
import { profileSchema, escapeHtml } from "../server/security";
describe("matching and notification rules", () => {
  it("matches a website need to offered skills instead of shared needs", () => {
    const r = rankProfiles("someone to build a website", demoProfiles);
    expect(r[0].profile.name).toBe("Rohan Mehta");
    expect(r.find((m) => m.profile.name === "Ananya Rao")).toBeUndefined();
  });
  it("does not recommend yourself", () =>
    expect(
      rankProfiles("website", demoProfiles, "sample-1").some(
        (m) => m.profile.id === "sample-1",
      ),
    ).toBe(false));
  it("has honest empty results", () =>
    expect(rankProfiles("astrophysics", demoProfiles)).toHaveLength(0));
  it("caps all mail at three and matches at two", () => {
    expect(canSend(3, 0, "connection")).toBe(false);
    expect(canSend(2, 2, "match")).toBe(false);
    expect(canSend(2, 2, "connection")).toBe(true);
  });
  it("resets at midnight in India", () =>
    expect(indiaDay(new Date("2026-11-10T18:30:00Z"))).toBe("2026-11-11"));
  it("rejects unsafe profile URLs and SVG uploads", () => {
    const p = { ...demoProfiles[0], email: "me@example.com", phone: "" };
    expect(
      profileSchema.safeParse({ ...p, website: "javascript:alert(1)" }).success,
    ).toBe(false);
    expect(
      profileSchema.safeParse({
        ...p,
        photo: "data:image/svg+xml;base64,PHN2Zz4=",
      }).success,
    ).toBe(false);
    expect(profileSchema.safeParse(p).success).toBe(true);
  });
  it("escapes attendee text in email templates", () =>
    expect(escapeHtml('<img src=x onerror="x">')).toBe(
      "&lt;img src=x onerror=&quot;x&quot;&gt;",
    ));
});
