import { readFile } from "node:fs/promises";
import path from "node:path";

import { expect, test } from "@playwright/test";

import type { E2eFixture } from "./global-setup";
import { completeContactDetailsStep } from "./wizardHelpers";

const FIXTURE_PATH = path.join(__dirname, ".fixture.json");

async function readFixture(): Promise<E2eFixture> {
  const raw = await readFile(FIXTURE_PATH, "utf-8");
  return JSON.parse(raw);
}

test.describe("booking page at /@handle/book (54.1.6.2)", () => {
  test("308-redirects the legacy /book/[artistId] URL to /@handle/book", async ({
    request,
  }) => {
    const { artistId, artistHandle } = await readFixture();

    const response = await request.get(`/book/${artistId}`, { maxRedirects: 0 });

    expect(response.status()).toBe(308);
    expect(response.headers()["location"]).toMatch(
      new RegExp(`/@${artistHandle}/book$`)
    );
  });

  test("returns 404 for an unknown legacy artist id", async ({ request }) => {
    const response = await request.get("/book/no-such-artist-e2e", {
      maxRedirects: 0,
    });

    expect(response.status()).toBe(404);
  });

  test("returns 404 for an unknown handle", async ({ request }) => {
    const response = await request.get("/@no_such_artist_e2e/book", {
      maxRedirects: 0,
    });

    expect(response.status()).toBe(404);
  });

  test("308-redirects an uppercase handle, keeping a valid ?service", async ({
    request,
  }) => {
    const { artistHandle } = await readFixture();

    const response = await request.get(
      `/@${artistHandle.toUpperCase()}/book?service=TIER_4`,
      { maxRedirects: 0 }
    );

    expect(response.status()).toBe(308);
    expect(response.headers()["location"]).toMatch(
      new RegExp(`/@${artistHandle}/book\\?service=TIER_4$`)
    );
  });

  test("the profile's service menu preselects that tier and its baseline budget", async ({
    page,
  }) => {
    const { artistHandle } = await readFixture();

    await page.goto(`/@${artistHandle}`);
    await page.getByRole("link", { name: "Request Tier 4" }).click();
    await expect(page).toHaveURL(
      `http://localhost:3000/@${artistHandle}/book?service=TIER_4`
    );
    await page.waitForLoadState("networkidle");

    // A guest starts on contact details; the tier lives on the next step.
    await completeContactDetailsStep(page);

    await expect(page.getByRole("radio", { name: "TIER_4" })).toBeChecked();
    await expect(page.getByText("£200 – £400")).toBeVisible();
  });

  test("ignores an unknown ?service value and keeps the default tier", async ({
    page,
  }) => {
    const { artistHandle } = await readFixture();

    await page.goto(`/@${artistHandle}/book?service=bogus`);
    await page.waitForLoadState("networkidle");

    await completeContactDetailsStep(page);

    await expect(page.getByRole("radio", { name: "TIER_2" })).toBeChecked();
    await expect(page.getByText("£50 – £100")).toBeVisible();
  });

  test("matches the visual baseline", async ({ page }) => {
    const { artistHandle } = await readFixture();

    await page.goto(`/@${artistHandle}/book`);
    await expect(
      page.getByRole("heading", { level: 1, name: "Request a booking" })
    ).toBeVisible();
    await page.waitForLoadState("networkidle");
    // Viewport, not fullPage: a full-page capture paints the fixed
    // WizardActionBar mid-form. stylePath hides the Next dev indicator.
    await expect(page).toHaveScreenshot({
      stylePath: path.join(__dirname, "screenshot.css"),
    });
  });
});
