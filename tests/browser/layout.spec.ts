import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("homepage content fits narrow screens without cropped text or controls", async ({
  page,
}) => {
  test.setTimeout(60000);
  for (const [width, height] of [
    [364, 876],
    [320, 568],
    [375, 812],
    [390, 844],
    [600, 960],
    [768, 1024],
    [876, 364],
    [1024, 600],
    [1440, 900],
  ]) {
    await page.setViewportSize({ width, height });
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: /The best thing/ }),
    ).toBeVisible();
    await expect(page.locator(".event-card").first()).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({
      path: `test-results/home-${width}.png`,
      fullPage: true,
    });
    const cropped = await page.evaluate(() => {
      const targets = [
        ...document.querySelectorAll<HTMLElement>(
          "header a, .landing-hero h1, .landing-hero h1 span, .landing-copy > p, .landing-copy > a, .section-title, .event-card",
        ),
      ];
      return targets
        .filter((el) => {
          const r = el.getBoundingClientRect();
          const text = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
          let node: Node | null;
          let clippedText = false;
          while ((node = text.nextNode())) {
            if (!node.textContent?.trim() || node.parentElement?.closest("svg"))
              continue;
            const range = document.createRange();
            range.selectNodeContents(node);
            if (
              [...range.getClientRects()].some(
                (rect) => rect.left < -1 || rect.right > innerWidth + 1,
              )
            )
              clippedText = true;
          }
          return r.left < -1 || r.right > innerWidth + 1 || clippedText;
        })
        .map((el) => ({
          element: el.tagName,
          text: el.textContent?.slice(0, 70),
          width: el.getBoundingClientRect().width,
          right: el.getBoundingClientRect().right,
        }));
    });
    expect(cropped, `Cropped homepage content at ${width}px`).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      `Page overflow at ${width}px`,
    ).toBe(true);
  }
  await page.setViewportSize({ width: 364, height: 876 });
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
});

test("public pages fit phone widths", async ({ page }) => {
  test.setTimeout(60000);
  for (const width of [320, 364, 390]) {
    await page.setViewportSize({ width, height: 876 });
    for (const path of [
      "/create",
      "/e/manage-agri-eureka-2026",
      "/e/manage-agri-eureka-2026/directory",
      "/e/manage-agri-eureka-2026/join",
      "/admin",
    ]) {
      await page.goto(path);
      await expect(page.locator("main h1").first()).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        `${path} at ${width}px`,
      ).toBe(true);
    }
  }
});
