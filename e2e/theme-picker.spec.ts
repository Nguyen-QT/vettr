import { readFile } from "node:fs/promises";
import path from "node:path";

import { expect, test } from "@playwright/test";

import { loginAsArtist } from "./authHelpers";
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
    const darkRadio = page.getByRole("radio", { name: "Dark" });
    await expect(darkRadio).toBeEnabled();
    await expect(darkRadio).toBeChecked();
    await expect(page.locator("html")).toHaveClass(/dark/);

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
            - radio "Light"
          - group:
            - radio "Dark" [checked]
    `);
  });

  test("choosing Light removes the dark class and survives a reload", async ({
    page,
  }) => {
    const fixture = await readFixture();
    await loginAsArtist(page, fixture);

    await page.goto(`/artist/${fixture.artistId}/settings/appearance`);

    const lightRadio = page.getByRole("radio", { name: "Light" });
    await lightRadio.click();
    await expect(lightRadio).toBeChecked();
    await expect(page.locator("html")).not.toHaveClass(/dark/);

    await page.reload();

    await expect(lightRadio).toBeEnabled();
    await expect(lightRadio).toBeChecked();
    await expect(page.locator("html")).not.toHaveClass(/dark/);
  });
});
