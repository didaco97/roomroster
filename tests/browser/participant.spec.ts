import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { blankProfile, eventDefault } from "../../src/domain";

const base = `/e/${eventDefault.slug}`;
test("production registration, code sign-in, self profile, reload, edit and request recovery", async ({
  page,
}) => {
  test.setTimeout(60000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 360, height: 800 });
  let person: any;
  let connections: any[] = [];
  let failRequest = true;
  const developer = {
    ...blankProfile(),
    id: "developer",
    event: eventDefault.slug,
    name: "Sam Developer",
    startup: "Web Studio",
    bio: "I build farm websites",
    location: "Pune",
    offers: ["Web / app developer"],
    joined: new Date().toISOString(),
  };
  await page.route("**/api/*", async (route) => {
    const req = route.request(),
      action = new URL(req.url()).pathname.split("/").pop();
    const b = req.postDataJSON();
    const signedIn = (await req.allHeaders()).cookie?.includes(
      "rr_test=verified",
    );
    let data: any = { ok: true },
      status = 200,
      headers: Record<string, string> = {};
    if (action === "load")
      data = {
        event: eventDefault,
        profiles: person ? [person, developer] : [developer],
        me: signedIn ? person : null,
        connections,
        admin: false,
      };
    if (action === "register") {
      person = {
        ...b.profile,
        id: "me",
        event: eventDefault.slug,
        joined: new Date().toISOString(),
      };
      data = { id: person.id, verificationRequired: true, codeSent: true };
    }
    if (action === "participant-login") {
      if (b.code !== "827364") {
        status = 401;
        data = { error: "That code is incorrect. Try again." };
      } else
        headers["Set-Cookie"] =
          "rr_test=verified; HttpOnly; SameSite=Lax; Path=/; Max-Age=3600";
    }
    if (action === "participant-request-code")
      data = { message: "Your code is on its way." };
    if (action === "search") data = { matches: [], mode: "keyword" };
    if (action === "update") person = { ...person, ...b.profile };
    if (action === "connect") {
      expect(signedIn).toBe(true);
      expect(b.to).not.toBe("me");
      await new Promise((r) => setTimeout(r, 350));
      if (failRequest) {
        failRequest = false;
        status = 503;
        data = { error: "Connection unavailable. Please try again." };
      } else
        connections = [
          {
            id: "request-1",
            event: eventDefault.slug,
            from: "me",
            to: "developer",
            status: "pending",
            created: new Date().toISOString(),
          },
        ];
    }
    if (action === "logout")
      headers["Set-Cookie"] = "rr_test=; HttpOnly; Path=/; Max-Age=0";
    await route.fulfill({
      status,
      headers,
      contentType: "application/json",
      body: JSON.stringify(data),
    });
  });
  await page.goto(base + "/join");
  await expect(page.getByText("PREVIEW NOTE", { exact: false })).toHaveCount(0);
  await expect(page.getByText("Add your photo", { exact: true })).toBeVisible();
  const photo = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = c.height = 32;
    c.getContext("2d")!.fillRect(0, 0, 32, 32);
    return c.toDataURL("image/png").split(",")[1];
  });
  await page
    .getByLabel("Upload founder photo")
    .setInputFiles({
      name: "test.png",
      mimeType: "image/png",
      buffer: Buffer.from(photo, "base64"),
    });
  await expect(page.getByAltText("Your uploaded photo")).toBeVisible();
  await page.getByLabel("What should we call you?").fill("Dhiraj Test");
  await page.getByLabel("Your email").fill("test@example.com");
  await page.getByLabel("Startup or project name").fill("Farm Lab");
  await page.getByLabel("What are you building?").fill("Tools for farmers");
  await page.getByLabel("Where are you based?").fill("Nashik");
  await page.getByRole("button", { name: /Next: find/ }).click();
  await page.getByRole("button", { name: "Join the room" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByLabel("Six-digit sign-in code")).toBeVisible();
  const a11y = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(a11y.violations).toEqual([]);
  await page.getByLabel("Six-digit sign-in code").fill("111111");
  await page.getByRole("button", { name: "Verify & sign in" }).click();
  await expect(page.getByRole("alert")).toContainText("incorrect");
  await page.getByLabel("Six-digit sign-in code").fill("827364");
  await page.getByRole("button", { name: "Verify & sign in" }).click();
  await page.getByRole("button", { name: "Explore the directory" }).click();
  await page.reload();
  await expect(
    page.getByRole("link", { name: "Edit your profile" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Dhiraj Test", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Request to connect" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Edit my profile" }).click();
  await expect(page.getByLabel("What should we call you?")).toHaveValue(
    "Dhiraj Test",
  );
  await page.getByLabel("What should we call you?").fill("Dhiraj Edited");
  await page.getByRole("button", { name: /Next: find/ }).click();
  await page.getByRole("button", { name: "Save my profile" }).click();
  await expect(
    page.getByRole("button", { name: "Dhiraj Edited", exact: true }),
  ).toBeVisible();
  await page.goBack();
  await expect(page.getByLabel("What should we call you?")).toHaveValue(
    "Dhiraj Edited",
  );
  await page.goto(base + "/join");
  await expect(page.getByLabel("What should we call you?")).toHaveValue(
    "Dhiraj Edited",
  );
  await page.goto(base + "/directory");
  await page
    .getByRole("button", { name: "Sam Developer", exact: true })
    .click();
  await page.getByRole("button", { name: "Request to connect" }).click();
  await expect(
    page.getByRole("button", { name: "Sending request…" }),
  ).toBeDisabled();
  await expect(page.getByRole("alert")).toContainText("Connection unavailable");
  await expect(
    page.getByRole("button", { name: "Request to connect" }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Request to connect" }).click();
  await expect(
    page.getByRole("button", { name: "Request recorded" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  for (const width of [320, 375, 768, 1440]) {
    await page.setViewportSize({ width, height: 850 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `test-results/participant-${width}.png`,
      fullPage: true,
    });
  }
  await page.goto(base + "/connections");
  await page.getByRole("button", { name: "Leave this session" }).click();
  await page.goto(base + "/profile");
  await expect(
    page.getByRole("heading", { name: "Your profile is waiting." }),
  ).toBeVisible();
  await expect(page.getByLabel("Startup or project name")).toHaveCount(0);
  await page.getByLabel("Your email").fill("test@example.com");
  await page.getByRole("button", { name: "Email my code" }).click();
  await page.getByLabel("Six-digit sign-in code").fill("827364");
  await page.getByRole("button", { name: "Verify & sign in" }).click();
  await expect(page.getByLabel("What should we call you?")).toHaveValue(
    "Dhiraj Edited",
  );
  expect(errors).toEqual([]);
});
