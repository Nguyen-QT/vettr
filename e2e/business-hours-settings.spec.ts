import { readFile } from "node:fs/promises";
import path from "node:path";

import { expect, test } from "@playwright/test";

import type { E2eFixture } from "./global-setup";

const FIXTURE_PATH = path.join(__dirname, ".fixture.json");

async function readFixture(): Promise<E2eFixture> {
  const raw = await readFile(FIXTURE_PATH, "utf-8");
  return JSON.parse(raw);
}

test.describe("artist business hours settings", () => {
  test("defaults every day to all three times open when nothing is configured", async ({
    page,
  }) => {
    const fixture = await readFixture();

    await page.goto(`/artist/${fixture.artistId}/hours`);
    await page.waitForLoadState("networkidle");

    await expect(
      page.getByRole("checkbox", { name: "Monday 11:00" })
    ).toBeChecked();
    await expect(
      page.getByRole("checkbox", { name: "Monday 14:00" })
    ).toBeChecked();
    await expect(
      page.getByRole("checkbox", { name: "Monday 17:30" })
    ).toBeChecked();
  });

  test("saving a day's hours persists across reload", async ({ page }) => {
    const fixture = await readFixture();

    await page.goto(`/artist/${fixture.artistId}/hours`);
    await page.waitForLoadState("networkidle");

    const tuesdayCheckbox = page.getByRole("checkbox", { name: "Tuesday 14:00" });
    const tuesdayRow = tuesdayCheckbox.locator(
      "xpath=ancestor::div[@data-slot='field']"
    );

    await tuesdayCheckbox.click();
    await tuesdayRow.getByRole("button", { name: "Save" }).click();
    await page.waitForLoadState("networkidle");

    await page.reload();
    await page.waitForLoadState("networkidle");

    await expect(
      page.getByRole("checkbox", { name: "Tuesday 14:00" })
    ).not.toBeChecked();
    await expect(
      page.getByRole("checkbox", { name: "Tuesday 11:00" })
    ).toBeChecked();
  });

  test("adding a blackout date override shows it in the overrides list", async ({
    page,
  }) => {
    const fixture = await readFixture();

    await page.goto(`/artist/${fixture.artistId}/hours`);
    await page.waitForLoadState("networkidle");

    await page.getByLabel("Date").fill("2099-12-25");
    await page.getByRole("button", { name: "Save override" }).click();

    await expect(
      page.getByText("2099-12-25: Blackout (fully closed)")
    ).toBeVisible();
  });
});
