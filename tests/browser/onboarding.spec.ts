import { test, expect } from "@playwright/test";
const base = "/e/manage-agri-eureka-2026";

test("join link opens registration directly", async ({ page }) => {
  await page.goto(base + "/join");
  await expect(
    page.getByPlaceholder("Your preferred name"),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Next: find your people/ }),
  ).toBeVisible();
});

test.describe("sign-in modal", () => {
  for (const vp of [
    { name: "mobile", width: 375, height: 800 },
    { name: "desktop", width: 1280, height: 900 },
  ]) {
    test(`create-profile choice is above the email field and keyboard stays closed (${vp.name})`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto(base);
      await page.getByRole("button", { name: /Sign in/ }).click();
      const dialog = page.getByRole("dialog");
      await expect(dialog.getByText(/Welcome back/)).toBeVisible();
      const join = dialog.getByRole("button", {
        name: /New here\? Create your profile/,
      });
      await expect(join).toBeVisible();
      const email = dialog.getByLabel("Your email");
      await expect(email).toBeVisible();
      const jb = await join.boundingBox();
      const eb = await email.boundingBox();
      expect(jb!.y + jb!.height).toBeLessThanOrEqual(eb!.y);
      // No auto keyboard: the email field is not focused, but focus is
      // inside the dialog, not stranded behind the overlay.
      await expect(email).not.toBeFocused();
      const focusInside = await page.evaluate(
        () =>
          document.activeElement?.closest('[role="dialog"]') != null,
      );
      expect(focusInside).toBe(true);
      // Focus trap still works: Tab cycles within the dialog.
      await page.keyboard.press("Tab");
      const stillInside = await page.evaluate(
        () =>
          document.activeElement?.closest('[role="dialog"]') != null,
      );
      expect(stillInside).toBe(true);
      if (vp.name === "mobile")
        await page.screenshot({ path: "test-results/signin-modal-mobile.png" });
      // Escape closes and focus returns to the opener.
      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden();
      await expect(
        page.getByRole("button", { name: /Sign in/ }),
      ).toBeFocused();
    });
  }
});

test("create-profile choice navigates to registration", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto(base);
  await page.getByRole("button", { name: /Sign in/ }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /New here\? Create your profile/ })
    .click();
  await expect(page).toHaveURL(new RegExp(`${base}/join`));
  await expect(page.getByPlaceholder("Your preferred name")).toBeVisible();
});
