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

test.describe("artist set up client profile settings", () => {
  test("reaches the page from the settings nav and shows the form", async ({
    page,
  }) => {
    const fixture = await readFixture();
    await loginAsArtist(page, fixture);

    await page.goto(`/artist/${fixture.artistId}/settings/hours`);
    await page.waitForLoadState("networkidle");

    await page.getByRole("link", { name: "Set up client profile" }).click();
    await page.waitForLoadState("networkidle");

    await expect(page).toHaveURL(
      `http://localhost:3000/artist/${fixture.artistId}/settings/set-up-client-profile`
    );
    await expect(page.getByLabel("Instagram handle")).toBeVisible();
  });

  // Uses the shared fixture artist Account (authenticatedSessionId), whose
  // Account.clientProfileId starts null -- same shared-state pattern as
  // business-hours-settings.spec.ts. Must stay the only spec in the suite
  // that submits this form, since linkOrCreateClientProfileForAccount is a
  // one-time link and a second submission would hit
  // ACCOUNT_ALREADY_HAS_CLIENT_PROFILE_ERROR_MESSAGE instead.
  test("submitting valid details shows the linked confirmation", async ({
    page,
  }) => {
    const fixture = await readFixture();
    await loginAsArtist(page, fixture);

    await page.goto(
      `/artist/${fixture.artistId}/settings/set-up-client-profile`
    );
    await page.waitForLoadState("networkidle");

    await page.getByLabel("Instagram handle").fill("e2e_artist_as_client");
    await page.getByLabel("First name").fill("Alex");
    await page.getByLabel("Last name").fill("Morgan");
    await page.getByLabel("Date of birth").fill("1995-05-05");
    await page.getByRole("button", { name: "Continue" }).click();

    await expect(
      page.getByText("You're all set — your client profile is linked.")
    ).toBeVisible();
  });
});
