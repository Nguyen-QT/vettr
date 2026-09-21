import { readFile } from "node:fs/promises";
import path from "node:path";

import { expect, test } from "@playwright/test";

import type { E2eFixture } from "./global-setup";

const FIXTURE_PATH = path.join(__dirname, ".fixture.json");

async function readFixture(): Promise<E2eFixture> {
  const raw = await readFile(FIXTURE_PATH, "utf-8");
  return JSON.parse(raw);
}

test.describe("artist upcoming appointments", () => {
  test("shows an approved request with a future booked slot", async ({ page }) => {
    const fixture = await readFixture();

    await page.goto(`/artist/${fixture.artistId}/appointments`);
    await page.waitForLoadState("networkidle");

    await expect(page.getByText(fixture.bookedSlotClientHandle)).toBeVisible();
  });

  test("does not show a still-pending request", async ({ page }) => {
    const fixture = await readFixture();

    await page.goto(`/artist/${fixture.artistId}/appointments`);
    await page.waitForLoadState("networkidle");

    // freestylePendingClientHandle is never approved/declined by any
    // other spec (unlike approve/declineClientHandle, whose own tests
    // mutate their status), so it's a safe always-PENDING control here.
    await expect(
      page.getByText(fixture.freestylePendingClientHandle)
    ).not.toBeVisible();
  });
});
