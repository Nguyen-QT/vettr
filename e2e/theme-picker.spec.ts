import { readFile } from "node:fs/promises";
import path from "node:path";

import { expect, test } from "@playwright/test";

import { loginAsArtist, loginAsClient } from "./authHelpers";
import type { E2eFixture } from "./global-setup";

const FIXTURE_PATH = path.join(__dirname, ".fixture.json");

async function readFixture(): Promise<E2eFixture> {
  const raw = await readFile(FIXTURE_PATH, "utf-8");
  return JSON.parse(raw);
}

test.describe("artist appearance settings", () => {
  test("the Appearance tab is reached from the settings nav and shows the current theme", async ({
    page,
  }) => {
    const fixture = await readFixture();
    await loginAsArtist(page, fixture);

    await page.goto(`/artist/${fixture.artistId}/settings/hours`);
    await page.getByRole("link", { name: "Appearance" }).click();
    await expect(page).toHaveURL(/\/settings\/appearance$/);

    // The picker renders disabled and unchecked until hydration, so wait
    // for it to be enabled before asserting which option is checked.
    const lightRadio = page.getByRole("radio", { name: "Light" });
    await expect(lightRadio).toBeEnabled();
    await expect(lightRadio).toBeChecked();
    await expect(page.locator("html")).not.toHaveClass(/dark/);

    await expect(page.getByRole("main")).toMatchAriaSnapshot(`
      - link "Dashboard"
      - navigation:
        - link "Business Hours"
        - link "Blackout Dates"
        - link "Deposit Amounts"
        - link "Payouts"
        - link "Set Up Client Profile"
        - link "Appearance"
      - separator
      - group "Theme":
        - paragraph: Saved on this device.
        - radiogroup "Theme":
          - group:
            - radio "Light" [checked]
          - group:
            - radio "Dark"
    `);
  });

  test("choosing Dark adds the dark class and survives a reload", async ({
    page,
  }) => {
    const fixture = await readFixture();
    await loginAsArtist(page, fixture);

    await page.goto(`/artist/${fixture.artistId}/settings/appearance`);

    const darkRadio = page.getByRole("radio", { name: "Dark" });
    await darkRadio.click();
    await expect(darkRadio).toBeChecked();
    await expect(page.locator("html")).toHaveClass(/dark/);

    await page.reload();

    await expect(darkRadio).toBeEnabled();
    await expect(darkRadio).toBeChecked();
    await expect(page.locator("html")).toHaveClass(/dark/);
  });
});

test.describe("client appearance settings", () => {
  test("the profile page shows the current theme", async ({
    page,
  }) => {
    const fixture = await readFixture();
    await loginAsClient(page, fixture.onboardedClientSessionId);

    await page.goto("/client/profile");

    // Same hydration wait as the artist tab.
    const lightRadio = page.getByRole("radio", { name: "Light" });
    await expect(lightRadio).toBeEnabled();
    await expect(lightRadio).toBeChecked();
    await expect(page.locator("html")).not.toHaveClass(/dark/);

    await expect(page.getByRole("group", { name: "Theme" })).toMatchAriaSnapshot(`
      - group "Theme":
        - paragraph: Saved on this device.
        - radiogroup "Theme":
          - group:
            - radio "Light" [checked]
          - group:
            - radio "Dark"
    `);
  });

  test("choosing Dark adds the dark class and survives a reload", async ({
    page,
  }) => {
    const fixture = await readFixture();
    await loginAsClient(page, fixture.onboardedClientSessionId);

    await page.goto("/client/profile");

    const darkRadio = page.getByRole("radio", { name: "Dark" });
    await darkRadio.click();
    await expect(darkRadio).toBeChecked();
    await expect(page.locator("html")).toHaveClass(/dark/);

    await page.reload();

    await expect(darkRadio).toBeEnabled();
    await expect(darkRadio).toBeChecked();
    await expect(page.locator("html")).toHaveClass(/dark/);
  });
});

// Signed-out pages have no theme control (50.2): they show the stored
// choice, else light.
test.describe("signed-out pages", () => {
  test("/ is light with nothing stored and has no fixed theme icon", async ({
    page,
  }) => {
    await page.goto("/");

    await expect(page.getByRole("heading", { level: 1, name: "Vettr" })).toBeVisible();
    await expect(page.locator("html")).not.toHaveClass(/dark/);
    await expect(page.getByRole("button", { name: "Toggle theme" })).toHaveCount(0);
  });

  test("a Dark choice made in Settings carries to /", async ({ page }) => {
    const fixture = await readFixture();
    await loginAsArtist(page, fixture);

    await page.goto(`/artist/${fixture.artistId}/settings/appearance`);
    const darkRadio = page.getByRole("radio", { name: "Dark" });
    await darkRadio.click();
    await expect(darkRadio).toBeChecked();

    // Signing out by dropping the session cookie keeps localStorage, and
    // a signed-in / would redirect to the dashboard instead of the gate.
    await page.context().clearCookies();
    await page.goto("/");

    await expect(page).toHaveURL("http://localhost:3000/");
    await expect(page.getByRole("heading", { level: 1, name: "Vettr" })).toBeVisible();
    await expect(page.locator("html")).toHaveClass(/dark/);
  });
});
