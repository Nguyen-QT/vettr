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

test.describe("artist dashboard", () => {
  test("quick stats show non-zero pending-requests and needs-resolution counts", async ({
    page,
  }) => {
    const fixture = await readFixture();
    await loginAsArtist(page, fixture);

    await page.goto(`/artist/${fixture.artistId}`);
    await page.waitForLoadState("networkidle");

    const pendingTile = page.locator('[data-slot="stat-tile"]', {
      hasText: "Pending requests",
    });
    const needsResolutionTile = page.locator('[data-slot="stat-tile"]', {
      hasText: "Needs resolution",
    });

    await expect(pendingTile).toBeVisible();
    await expect(needsResolutionTile).toBeVisible();

    // Several dedicated, untouched pending/past-due fixtures exist
    // (e.g. flaggedClientHandle, pastDueUntouchedClientHandle), so both
    // counts should always be at least 1 regardless of what other
    // specs mutate concurrently.
    const pendingCount = Number(await pendingTile.locator("span").last().innerText());
    const needsResolutionCount = Number(
      await needsResolutionTile.locator("span").last().innerText()
    );

    expect(pendingCount).toBeGreaterThanOrEqual(1);
    expect(needsResolutionCount).toBeGreaterThanOrEqual(1);
  });

  test("shows a today-dated, in-progress appointment under Today's Schedule", async ({
    page,
  }) => {
    const fixture = await readFixture();
    await loginAsArtist(page, fixture);

    await page.goto(`/artist/${fixture.artistId}`);
    await page.waitForLoadState("networkidle");

    const todaysScheduleSection = page.locator("section", {
      hasText: "Today's Schedule",
    });

    await expect(
      todaysScheduleSection.getByText(fixture.dashboardTodayClientHandle)
    ).toBeVisible();
    // A fixed-2020-dated past-due fixture is never "today", so it must
    // not leak into this section even though it's past due.
    await expect(
      todaysScheduleSection.getByText(fixture.pastDueUntouchedClientHandle)
    ).toHaveCount(0);
  });

  test("shows a pending request and a past-due appointment under Urgent Action Items, linking out to take action", async ({
    page,
  }) => {
    const fixture = await readFixture();
    await loginAsArtist(page, fixture);

    await page.goto(`/artist/${fixture.artistId}`);
    await page.waitForLoadState("networkidle");

    const urgentSection = page.locator("section", {
      hasText: "Urgent Action Items",
    });

    const pendingLink = urgentSection.locator("a", {
      hasText: fixture.flaggedClientHandle,
    });
    const pastDueLink = urgentSection.locator("a", {
      hasText: fixture.dashboardTodayClientHandle,
    });

    await expect(pendingLink).toHaveAttribute(
      "href",
      `/artist/${fixture.artistId}/requests`
    );
    await expect(pastDueLink).toHaveAttribute(
      "href",
      `/artist/${fixture.artistId}/appointments?tab=needs-resolution`
    );

    await pendingLink.click();
    await expect(page).toHaveURL(`http://localhost:3000/artist/${fixture.artistId}/requests`);
  });
});
