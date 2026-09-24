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

  test("navigating to a different date clears a previously selected appointment", async ({
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
    await dayEntry.click();
    await expect(page.getByText(/Estimated price/)).toBeVisible();

    // Navigating to an empty date must revert the panel to the empty
    // state instead of leaving the old appointment's detail showing.
    await page.getByLabel("Jump to date").fill("2020-06-01");
    await expect(page.getByText("No appointment selected")).toBeVisible();
  });

  test("month view renders a grid and selecting a day still surfaces its appointments", async ({
    page,
  }) => {
    const fixture = await readFixture();
    await loginAsArtist(page, fixture);

    await page.goto(`/artist/${fixture.artistId}/calendar`);
    await page.waitForLoadState("networkidle");

    await page.getByRole("button", { name: "Month" }).click();
    await page.getByLabel("Jump to date").fill(fixture.bookedSlotDate);

    const dayEntry = page.getByRole("button", {
      name: new RegExp(`@${fixture.bookedSlotClientHandle}`),
    });
    await expect(dayEntry).toBeVisible();
    await dayEntry.click();

    await expect(page.getByText(/Estimated price/)).toBeVisible();
  });
});

// CLAUDE.md 19.1.5: the mobile (<1024px) stacked agenda -- list screen
// (week/month strip + that date's appointments) -> detail screen ->
// edit screen, with top-left back navigation popping one level at a
// time. Overrides the viewport rather than adding a whole new
// Playwright project, since this suite only needs the one breakpoint
// check alongside the existing desktop coverage above.
test.describe("artist calendar (mobile)", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("selecting an upcoming appointment slides to detail, then reschedule slides to the edit screen, and back navigates one level at a time", async ({
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

    // Detail screen.
    await expect(page.getByText(/Estimated price/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Reschedule" })).toBeVisible();

    // Edit screen.
    await page.getByRole("button", { name: "Reschedule" }).click();
    await expect(page.getByText("Reschedule appointment")).toBeVisible();
    await expect(page.getByLabel("New date")).toBeVisible();

    // Back from edit returns to detail, not all the way to the list.
    await page.getByRole("button", { name: "Back" }).click();
    await expect(page.getByText(/Estimated price/)).toBeVisible();
    await expect(page.getByText("Reschedule appointment")).not.toBeVisible();

    // Back from detail returns to the list.
    await page.getByRole("button", { name: "Back" }).click();
    await expect(dayEntry).toBeVisible();
  });

  test("selecting a past-due appointment's detail screen shows checkout/no-show actions instead", async ({
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
    // No Reschedule/edit screen for a past-due appointment.
    await expect(page.getByRole("button", { name: "Reschedule" })).not.toBeVisible();
  });

  test("the list screen's week/month toggle switches grids without losing the selected date", async ({
    page,
  }) => {
    const fixture = await readFixture();
    await loginAsArtist(page, fixture);

    await page.goto(`/artist/${fixture.artistId}/calendar`);
    await page.waitForLoadState("networkidle");

    await page.getByLabel("Jump to date").fill(fixture.bookedSlotDate);
    await page.getByRole("button", { name: "Month" }).click();

    const dayEntry = page.getByRole("button", {
      name: new RegExp(`@${fixture.bookedSlotClientHandle}`),
    });
    await expect(dayEntry).toBeVisible();
    await dayEntry.click();
    await expect(page.getByText(/Estimated price/)).toBeVisible();
  });
});
