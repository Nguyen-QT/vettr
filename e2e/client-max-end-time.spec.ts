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

test.describe("client max end time", () => {
  test("shows an optional 'Must be finished by' input on the intake form", async ({
    page,
  }) => {
    const fixture = await readFixture();

    await page.goto(`/book/${fixture.artistId}`);
    await page.waitForLoadState("networkidle");

    await expect(page.getByLabel("Must be finished by (optional)")).toBeVisible();
  });

  test("rejects a must-finish-by time that doesn't allow at least 90 minutes", async ({
    page,
  }) => {
    const fixture = await readFixture();

    await page.goto(`/book/${fixture.artistId}`);
    await page.waitForLoadState("networkidle");

    await page.getByLabel("Preferred date").fill("2099-01-01");
    await page.getByRole("radio", { name: "14:00" }).click();
    await page.getByLabel("Must be finished by (optional)").fill("14:30");
    await page.getByRole("button", { name: "Submit request" }).click();

    await expect(
      page.getByText(
        "Must-finish-by time must allow at least 90 minutes from your preferred start time."
      )
    ).toBeVisible();
  });

  test("warns (without blocking) when the window is tight for the selected tier", async ({
    page,
  }) => {
    const fixture = await readFixture();

    await page.goto(`/book/${fixture.artistId}`);
    await page.waitForLoadState("networkidle");

    // TIER_2 (the form's default) has a 60-minute estimated duration,
    // shorter than the 90-minute hard floor, so the warning can never
    // fire for it -- TIER_4 (180 min) is used here so a valid (>= 90
    // min) but still-tight window actually falls under the estimate.
    // A date no other spec's fixtures touch -- 2099-01-01's 11:00 slot
    // in particular gets legitimately BOOKED by artist-dashboard.spec.ts's
    // approve test (shared, artist-wide availability, not test-scoped),
    // which would otherwise race this test's own radio selection.
    await page.getByRole("radio", { name: "TIER_4" }).click();
    await page.getByLabel("Preferred date").fill("2099-10-01");
    await page.getByRole("radio", { name: "11:00" }).click();
    await page.getByLabel("Must be finished by (optional)").fill("13:00");

    await expect(
      page.getByText(
        "Due to the complexity of this proposal, the design may need to be simplified to meet your hard deadline."
      )
    ).toBeVisible();
    // Not blocking -- no FieldError for the (still 90+ minute) window.
    await expect(
      page.getByText(
        "Must-finish-by time must allow at least 90 minutes from your preferred start time."
      )
    ).not.toBeVisible();
  });

  test("shows the client's must-finish-by time on the artist's review card", async ({
    page,
  }) => {
    const fixture = await readFixture();
    await loginAsArtist(page, fixture);

    await page.goto(`/artist/${fixture.artistId}`);
    const card = page.locator("article", {
      hasText: fixture.maxEndTimeClientHandle,
    });

    await expect(card.getByText(/Must be finished by: 14:30/)).toBeVisible();
  });
});
