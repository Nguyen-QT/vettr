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

// CLAUDE.md 19.1.4: the desktop (>=1024px, which Playwright's Desktop
// Chrome project already renders at) master-detail calendar. Jumping
// to a fixture date via the date input (rather than clicking prev/next
// thousands of times to reach a fixed 2099/2020 fixture date) surfaces
// that day's appointments; selecting one renders the shared
// AppointmentDetail panel plus the right action set for whether it's
// upcoming or past-due.
test.describe("artist calendar (desktop)", () => {
  test("selecting an upcoming appointment shows its detail and reschedule/cancel actions", async ({
    page,
  }) => {
    const fixture = await readFixture();
    await loginAsArtist(page, fixture);

    await page.goto(`/artist/${fixture.artistId}/calendar`);
    await page.waitForLoadState("networkidle");

    await page.getByLabel("Jump to date").fill(fixture.bookedSlotDate);

    const dayEntry = page.getByRole("button", {
      name: new RegExp(`@${fixture.bookedSlotClientHandle}`),
    });
    await expect(dayEntry).toBeVisible();
    await dayEntry.click();

    await expect(page.getByText(/Estimated price/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Reschedule" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Cancel booking" })).toBeVisible();
  });

  test("selecting a past-due appointment shows checkout/no-show actions instead", async ({
    page,
  }) => {
    const fixture = await readFixture();
    await loginAsArtist(page, fixture);

    await page.goto(`/artist/${fixture.artistId}/calendar`);
    await page.waitForLoadState("networkidle");

    await page.getByLabel("Jump to date").fill("2020-01-04");

    const dayEntry = page.getByRole("button", {
      name: new RegExp(`@${fixture.pastDueUntouchedClientHandle}`),
    });
    await expect(dayEntry).toBeVisible();
    await dayEntry.click();

    await expect(page.getByText(/Estimated price/)).toBeVisible();
    await expect(page.getByRole("link", { name: "Checkout" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Mark no-show" })).toBeVisible();
  });

  test("shows an empty state until an appointment is selected", async ({ page }) => {
    const fixture = await readFixture();
    await loginAsArtist(page, fixture);

    await page.goto(`/artist/${fixture.artistId}/calendar`);
    await page.waitForLoadState("networkidle");

    await expect(page.getByText("No appointment selected")).toBeVisible();
  });
});
