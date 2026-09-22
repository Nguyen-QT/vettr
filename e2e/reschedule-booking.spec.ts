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

test.describe("artist reschedules an approved booking", () => {
  test("moves the appointment to a new date/time", async ({ page }) => {
    const fixture = await readFixture();
    await loginAsArtist(page, fixture);

    await page.goto(`/artist/${fixture.artistId}/appointments`);
    await page.waitForLoadState("networkidle");

    // Doesn't assert the original time text: the fixture's date is
    // constructed by the Playwright test-runner process (global-setup.ts),
    // while the display is rendered by the separate `npm run dev` server
    // process -- the two aren't guaranteed to agree on local timezone.
    // The reschedule below is a same-process round trip (server action
    // writes, server component reads), so its result is safe to assert.
    const card = page.locator("article", {
      hasText: fixture.rescheduleTestClientHandle,
    });
    await expect(card).toBeVisible();

    await card.getByRole("button", { name: "Reschedule" }).click();
    await card.getByLabel("New date").fill("2099-07-15");
    await card.getByRole("radio", { name: "14:00" }).click();
    await card.getByRole("button", { name: "Save new time" }).click();

    await expect(card.getByText(/14:00 –/)).toBeVisible();
    await expect(card.getByText("15 Jul 2099", { exact: false })).toBeVisible();
  });
});
