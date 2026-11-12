import { test, expect } from "@playwright/test";
const base = "/e/manage-agri-eureka-2026";

function addPerson(page: import("@playwright/test").Page, name: string) {
  return page.evaluate((n) => {
    const s = JSON.parse(localStorage.getItem("roomroster-v1")!);
    s.profiles.push({
      id: `sample-${n.replace(/\s+/g, "-").toLowerCase()}`,
      event: "manage-agri-eureka-2026",
      name: n,
      startup: "Canopy Sense",
      bio: "Drone imagery for crop health.",
      location: "Coimbatore",
      sector: "Agri-tech",
      offers: ["AI / data specialist"],
      needs: [],
      offerText: "I map crop stress from drone photos.",
      needText: "",
      website: "",
      linkedin: "",
      photo: "",
      joined: new Date().toISOString(),
      alerts: false,
      aiConsent: false,
    });
    localStorage.setItem("roomroster-v1", JSON.stringify(s));
  }, name);
}

test("directory refreshes in the background without losing search text", async ({
  page,
}) => {
  test.setTimeout(90000);
  await page.goto(base + "/directory");
  await expect(
    page.getByRole("button", { name: /Rohan Mehta/ }),
  ).toBeVisible();
  const box = page.getByLabel(
    "Search people, skills, or describe what you need",
  );
  await box.fill("soil");
  // Another participant registering elsewhere: in demo mode the shared
  // directory data lives in localStorage, so a write there is what a
  // background reload picks up.
  await addPerson(page, "Priya Nandakumar");
  // No reload: the 30s background refresh must add the new person by itself.
  await expect(
    page.getByRole("button", { name: /Priya Nandakumar/ }),
  ).toBeVisible({ timeout: 45000 });
  await expect(box).toHaveValue("soil");
  await expect(page.getByRole("button", { name: /Rohan Mehta/ })).toBeVisible();
  await page.screenshot({
    path: "test-results/autorefresh.png",
    fullPage: true,
  });
});

test("submitted search results survive a background refresh", async ({
  page,
}) => {
  test.setTimeout(90000);
  await page.goto(base + "/directory");
  const box = page.getByLabel(
    "Search people, skills, or describe what you need",
  );
  await box.fill("soil");
  await box.press("Enter");
  await expect(page.getByText(/Skill and keyword matches/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Ananya Rao/ }),
  ).toBeVisible();
  await addPerson(page, "Priya Nandakumar");
  // The People tab count proves the background reload landed.
  await expect(page.getByRole("link", { name: /People 9/ })).toBeVisible({
    timeout: 45000,
  });
  await expect(page.getByText(/Skill and keyword matches/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Ananya Rao/ }),
  ).toBeVisible();
});

test("an open profile stays put across a background refresh", async ({
  page,
}) => {
  test.setTimeout(90000);
  await page.goto(base + "/directory");
  await page.getByRole("button", { name: /Rohan Mehta/ }).click();
  // The card opens the profile overlay.
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText(/Simple digital tools/)).toBeVisible();
  await addPerson(page, "Priya Nandakumar");
  // The 30s background poll fires while the overlay is open.
  await page.waitForTimeout(35000);
  // The overlay never closed or lost its content.
  await expect(dialog.getByText(/Simple digital tools/)).toBeVisible();
  await page.keyboard.press("Escape");
  // And the poll really happened: the new person is in the refreshed data.
  await expect(page.getByRole("link", { name: /People 9/ })).toBeVisible();
});

test("connection status updates appear without a reload", async ({ page }) => {
  test.setTimeout(90000);
  await page.addInitScript(() => {
    const ev = {
      slug: "manage-agri-eureka-2026",
      name: "MANAGE Agri-Eureka 2026",
      subtitle: "",
      description: "",
      location: "",
      start: "2026-11-10",
      end: "2026-11-14",
    };
    localStorage.setItem(
      "roomroster-v1",
      JSON.stringify({
        events: [ev],
        profiles: [
          {
            id: "me-1",
            event: ev.slug,
            name: "Test Me",
            startup: "",
            bio: "My bio.",
            location: "",
            sector: "Agri-tech",
            needs: [],
            offers: [],
            needText: "",
            offerText: "",
            website: "",
            linkedin: "",
            photo: "",
            joined: new Date().toISOString(),
            alerts: false,
            aiConsent: false,
            email: "me@example.com",
          },
          {
            id: "other-1",
            event: ev.slug,
            name: "Rohan Mehta",
            startup: "FieldStack",
            bio: "Simple digital tools.",
            location: "Pune",
            sector: "Agri-tech",
            needs: [],
            offers: ["Web / app developer"],
            needText: "",
            offerText: "",
            website: "",
            linkedin: "",
            photo: "",
            joined: new Date().toISOString(),
            alerts: false,
            aiConsent: false,
          },
        ],
        connections: [
          {
            id: "c-1",
            event: ev.slug,
            from: "me-1",
            to: "other-1",
            status: "pending",
            created: new Date().toISOString(),
          },
        ],
        self: { [ev.slug]: "me-1" },
      }),
    );
  });
  await page.goto(base + "/connections");
  await expect(page.getByText(/Your invitation is on its way/)).toBeVisible();
  // The recipient accepts from their own device; the next background
  // reload must show it here with no refresh.
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem("roomroster-v1")!);
    s.connections[0].status = "accepted";
    s.connections[0].email = "rohan@example.com";
    localStorage.setItem("roomroster-v1", JSON.stringify(s));
  });
  await expect(page.getByText(/connected. Say hello/)).toBeVisible({
    timeout: 45000,
  });
});
