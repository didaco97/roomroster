import { test, expect } from "@playwright/test";
const base = "/e/manage-agri-eureka-2026";
// 1x1 opaque pixel, so the avatar render is deterministic.
const PIXEL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function seed(photo: string) {
  const s = JSON.parse(localStorage.getItem("roomroster-v1")!);
  s.self["manage-agri-eureka-2026"] = "sample-1";
  const me = s.profiles.find((p: { id: string }) => p.id === "sample-1");
  me.photo = photo;
  localStorage.setItem("roomroster-v1", JSON.stringify(s));
}

test("header shows your photo once one is saved", async ({ page }) => {
  await page.goto(base);
  await expect(page.getByRole("heading", { name: /Big ideas/ })).toBeVisible();
  await page.evaluate(seed, PIXEL);
  await page.goto(base);
  const avatar = page.getByRole("link", { name: /Edit your profile/ });
  await expect(avatar).toBeVisible();
  await expect(
    avatar.getByRole("img", { name: "Your profile photo" }),
  ).toBeVisible();
  await expect(avatar).not.toHaveText(/\S/);
});

test("header falls back to initials without a photo", async ({ page }) => {
  await page.goto(base);
  await expect(page.getByRole("heading", { name: /Big ideas/ })).toBeVisible();
  await page.evaluate(seed, "");
  await page.goto(base);
  const avatar = page.getByRole("link", { name: /Edit your profile/ });
  await expect(avatar).toBeVisible();
  await expect(avatar.getByRole("img")).toHaveCount(0);
  await expect(avatar).toHaveText(/\S{1,3}/);
});
