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

// CLAUDE.md 18.1: selecting an AppointmentCard on the upcoming list
// expands a detail dialog with the full booking. bookedSlotRequestId
// (the fixture behind bookedSlotClientHandle) has no estimatedPrice
// set, which doubles as coverage for "estimated price always shown"
// -- the dialog surfaces that gap explicitly instead of hiding it.
test.describe("appointment detail dialog", () => {
  test("expands an appointment card into the full detail on selection", async ({ page }) => {
    const fixture = await readFixture();
    await loginAsArtist(page, fixture);

    await page.goto(`/artist/${fixture.artistId}/appointments`);
    await page.waitForLoadState("networkidle");

    const card = page.locator("article", { hasText: fixture.bookedSlotClientHandle });
    await card.getByRole("button", { name: "View appointment detail" }).click();

    await expect(page.getByText("Appointment detail")).toBeVisible();
    await expect(page.getByText("Estimated price: Not yet set")).toBeVisible();

    await page.getByRole("button", { name: "Close" }).click();
    await expect(page.getByText("Appointment detail")).not.toBeVisible();
  });

  test("the Instagram link still navigates without also closing the flow", async ({ page }) => {
    const fixture = await readFixture();
    await loginAsArtist(page, fixture);

    await page.goto(`/artist/${fixture.artistId}/appointments`);
    await page.waitForLoadState("networkidle");

    const card = page.locator("article", { hasText: fixture.bookedSlotClientHandle });
    const instagramLink = card.getByRole("link", {
      name: `@${fixture.bookedSlotClientHandle}`,
    });

    await expect(instagramLink).toHaveAttribute(
      "href",
      `https://instagram.com/${fixture.bookedSlotClientHandle}`
    );
    await expect(instagramLink).toHaveAttribute("target", "_blank");

    // Clicking it must not also open the detail dialog underneath.
    const popupPromise = page.waitForEvent("popup");
    await instagramLink.click();
    await popupPromise;
    await expect(page.getByText("Appointment detail")).not.toBeVisible();
  });
});
