export const roles = [
  "Web / app developer",
  "AI / data specialist",
  "IoT / hardware engineer",
  "Agronomist",
  "Crop scientist",
  "Soil expert",
  "Agricultural engineer",
  "Food technologist",
  "Packaging specialist",
  "Product designer",
  "Marketing specialist",
  "Sales professional",
  "Export specialist",
  "Operations expert",
];
export const sectors = [
  "All sectors",
  "Agri-tech",
  "Sustainable farming",
  "Food & processing",
  "Market access",
  "Research & services",
];
export type EventInfo = {
  slug: string;
  name: string;
  subtitle: string;
  description: string;
  location: string;
  start: string;
  end: string;
  closed?: boolean;
};
export type Profile = {
  id: string;
  event: string;
  name: string;
  startup: string;
  bio: string;
  location: string;
  sector: string;
  needs: string[];
  offers: string[];
  needText: string;
  offerText: string;
  website: string;
  linkedin: string;
  photo: string;
  joined: string;
  alerts: boolean;
  aiConsent: boolean;
  email?: string;
  phone?: string;
  verified?: boolean;
};
export type Connection = {
  id: string;
  event: string;
  from: string;
  to: string;
  status: "pending" | "accepted" | "declined";
  created: string;
  name?: string;
  email?: string;
  phone?: string;
};
export const eventDefault: EventInfo = {
  slug: "manage-agri-eureka-2026",
  name: "MANAGE Agri-Eureka 2026",
  subtitle: "National-level Agri-Innovation and Business Plan Challenge",
  description:
    "Five days of ideas, field visits, and new possibilities. This is your space to meet fellow participants, share what you’re building, and find someone who can help you take the next step.",
  location: "MANAGE, Hyderabad",
  start: "2026-11-10",
  end: "2026-11-14",
};
export const blankProfile = (): Omit<Profile, "id" | "joined" | "event"> => ({
  name: "",
  startup: "",
  bio: "",
  location: "",
  sector: "Agri-tech",
  needs: [],
  offers: [],
  needText: "",
  offerText: "",
  website: "",
  linkedin: "",
  photo: "",
  email: "",
  phone: "",
  alerts: true,
  aiConsent: false,
});
const groups = [
  [
    "website",
    "web",
    "developer",
    "shopify",
    "ecommerce",
    "e-commerce",
    "online store",
    "app",
    "software",
  ],
  ["soil", "agronomist", "agronomy", "crop", "farming"],
  ["marketing", "brand", "branding", "social", "promotion"],
  ["iot", "sensor", "hardware", "irrigation"],
  ["food", "processing", "shelf", "packaging"],
  ["export", "international"],
  ["ai", "data", "machine learning"],
];
const words = (s: string) =>
  s
    .toLowerCase()
    .match(/[a-z0-9]+/g)
    ?.filter(
      (w) =>
        w.length > 2 &&
        ![
          "the",
          "for",
          "and",
          "with",
          "someone",
          "need",
          "help",
          "can",
          "who",
          "our",
          "looking",
          "want",
        ].includes(w),
    ) || [];
export function rankProfiles(
  query: string,
  profiles: Profile[],
  self?: string,
) {
  const q = query.toLowerCase();
  const tokens = words(q);
  return profiles
    .filter((p) => p.id !== self)
    .map((p) => {
      const offered = [...p.offers, p.offerText].join(" ").toLowerCase();
      const context = [p.name, p.startup, p.bio, p.sector, p.location]
        .join(" ")
        .toLowerCase();
      let score = tokens.reduce(
        (n, t) => n + (offered.includes(t) ? 4 : context.includes(t) ? 1 : 0),
        0,
      );
      for (const g of groups)
        if (g.some((t) => q.includes(t)) && g.some((t) => offered.includes(t)))
          score += 6;
      return {
        profile: p,
        score,
        reason: p.offers.length
          ? `Offers ${p.offers.slice(0, 2).join(" and ").toLowerCase()}.`
          : p.offerText || "Related to their profile description.",
      };
    })
    .filter((x) => !q || x.score > 0)
    .sort((a, b) => b.score - a.score);
}
export function canSend(total: number, recommendations: number, kind: string) {
  return (
    ["admin-code", "participant-code"].includes(kind) ||
    (total < 3 && (kind !== "match" || recommendations < 2))
  );
}
export function indiaDay(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}
export function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((n) => n[0])
    .join("")
    .toUpperCase();
}
