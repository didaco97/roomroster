import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
const base = "/e/manage-agri-eureka-2026";
test("event and directory work at mobile and desktop widths", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  for (const width of [375, 768, 1440]) {
    await page.setViewportSize({ width, height: 950 });
    await page.goto(base);
    await expect(
      page.getByRole("heading", { name: /Big ideas/ }),
    ).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `test-results/event-${width}.png`,
      fullPage: true,
    });
    await page.goto(base + "/directory");
    await expect(
      page.getByRole("button", { name: /Rohan Mehta/ }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `test-results/directory-${width}.png`,
      fullPage: true,
    });
  }
  expect(errors).toEqual([]);
});
test("onboarding, recommendations, search, request and profile editing", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(base + "/join");
  await page.getByLabel("What should we call you?").fill("Dhiraj Test");
  await page
    .getByLabel("Your email", { exact: false })
    .fill("dhiraj-test@example.com");
  await page.getByLabel("Startup or project name").fill("Harvest Test");
  await page
    .getByLabel("What are you building?")
    .fill("An online produce business.");
  await page.getByLabel("Where are you based?").fill("Nashik");
  await page.getByRole("button", { name: /Next: find/ }).click();
  await page
    .getByRole("group", { name: "Who would you like to meet?" })
    .getByLabel("Web / app developer", { exact: true })
    .check();
  await page
    .getByLabel("Anything specific")
    .fill("I need a website for selling organic produce");
  await page.getByRole("button", { name: "Join the room" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("dialog").getByText("Rohan Mehta")).toBeVisible();
  await page.getByRole("button", { name: "Explore the directory" }).click();
  await page.getByRole("button", { name: /Rohan Mehta/ }).click();
  await page.getByRole("button", { name: "Request to connect" }).click();
  await expect(
    page.getByRole("button", { name: "Request recorded" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("link", { name: "Edit your profile" }).click();
  await page.getByLabel("What should we call you?").fill("Dhiraj Updated");
  await page.getByRole("button", { name: /Next: find/ }).click();
  await page.getByRole("button", { name: "Save my profile" }).click();
  await expect(
    page.getByRole("button", { name: /Dhiraj Updated/ }),
  ).toBeVisible();
  await page
    .getByRole("textbox", {
      name: "Search people, skills, or describe what you need",
    })
    .fill("website");
  await page.getByRole("button", { name: "Find people", exact: true }).click();
  await expect(page.getByRole("button", { name: /Rohan Mehta/ })).toBeVisible();
});
test("event creation isolates directories", async ({ page }) => {
  await page.goto("/create");
  await page.getByLabel("Event name").fill("Test growers");
  await page.getByLabel("A short introduction").fill("A gathering");
  await page.getByLabel("About your event").fill("A local farmer gathering");
  await page.getByLabel("Location", { exact: true }).fill("Pune");
  await page.getByLabel("Starts").fill("2026-12-01");
  await page.getByLabel("Ends").fill("2026-12-02");
  await page.getByLabel("Your organizer email").fill("host@example.com");
  await page.getByRole("button", { name: "Create event directory" }).click();
  await expect(
    page.getByRole("heading", { name: "Test growers" }),
  ).toBeVisible();
  await page.getByRole("link", { name: /People directory/ }).click();
  await expect(page.getByText("A little more room to grow.")).toBeVisible();
  await expect(page.getByRole("button", { name: /Rohan Mehta/ })).toHaveCount(
    0,
  );
});
test("core screens have no serious accessibility violations", async ({
  page,
}) => {
  for (const path of [base, base + "/directory", base + "/join", "/"]) {
    await page.goto(path);
    await page.evaluate(() => document.fonts.ready);
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(
      results.violations.map((v) => ({
        id: v.id,
        nodes: v.nodes.map((n) => n.target),
      })),
    ).toEqual([]);
  }
});
test("recipient accepts a request and modal supports keyboard dismissal", async ({
  page,
}) => {
  await page.goto(base);
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem("roomroster-v1")!);
    s.self["manage-agri-eureka-2026"] = "sample-1";
    s.connections.push({
      id: "test-request",
      event: "manage-agri-eureka-2026",
      from: "sample-0",
      to: "sample-1",
      status: "pending",
      created: new Date().toISOString(),
    });
    localStorage.setItem("roomroster-v1", JSON.stringify(s));
  });
  await page.goto(base + "/connections");
  await page.getByRole("button", { name: "Accept & share contact" }).click();
  await expect(page.getByText("You’re connected. Say hello!")).toBeVisible();
  await page.goto(base + "/directory");
  await page.getByRole("button", { name: /Ananya Rao/ }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Connected", exact: true }),
  ).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
