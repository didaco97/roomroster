import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { eventDefault } from "../../src/domain";
test("admin sign-in, participant removal, and multi-event creation UI", async ({
  page,
}) => {
  let authenticated = false;
  let people = [
    {
      id: "person-1",
      event: eventDefault.slug,
      name: "Actual Participant",
      startup: "Farm",
      email: "person@example.com",
      verified: true,
    },
  ];
  let created = false;
  await page.route("**/api/*", async (route) => {
    const action = new URL(route.request().url()).pathname.split("/").pop();
    let json: any = {};
    if (action === "admin-session") json = { authenticated };
    if (action === "admin-request-code") json = { message: "Check your email" };
    if (action === "admin-login") {
      authenticated = true;
      json = { ok: true };
    }
    if (action === "admin-overview")
      json = {
        events: [
          { ...eventDefault, participants: people.length, connections: 0 },
        ],
        participants: people,
        mail: [],
        services: { database: true, email: false, ai: false, siteUrl: true },
      };
    if (action === "admin-remove") {
      people = [];
      json = { ok: true };
    }
    if (action === "create-event") {
      created = true;
      json = { slug: "created-event" };
    }
    await route.fulfill({ json });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/admin");
  await expect(
    page.getByRole("heading", { name: /Welcome back/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Email me a sign-in code" }).click();
  await page.getByLabel("Six-digit email code").fill("123456");
  await page.getByRole("button", { name: "Verify code & sign in" }).click();
  await expect(page.getByText("Actual Participant")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/admin-mobile.png",
    fullPage: true,
  });
  const scan = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(scan.violations).toEqual([]);
  await page.getByRole("button", { name: "Remove", exact: true }).click();
  await page
    .getByRole("button", { name: "Remove participant", exact: true })
    .click();
  await expect(
    page.getByText("No participants yet.", { exact: false }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Create an event +" }).click();
  await page.getByLabel("Event name").fill("Next Gathering");
  await page.getByLabel("A short introduction").fill("Meet the growers");
  await page
    .getByLabel("About your event")
    .fill("A gathering for agriculture founders");
  await page.getByLabel("Location", { exact: true }).fill("Pune");
  await page.getByLabel("Starts").fill("2026-12-01");
  await page.getByLabel("Ends").fill("2026-12-02");
  await page.getByRole("button", { name: "Create event directory" }).click();
  await expect(page).toHaveURL(/created-event/);
  expect(created).toBe(true);
});
