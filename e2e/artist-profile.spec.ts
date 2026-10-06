import { readFile } from "node:fs/promises";
import path from "node:path";

import { expect, test } from "@playwright/test";

import type { E2eFixture } from "./global-setup";

const FIXTURE_PATH = path.join(__dirname, ".fixture.json");

async function readFixture(): Promise<E2eFixture> {
  const raw = await readFile(FIXTURE_PATH, "utf-8");
  return JSON.parse(raw);
}

test.describe("public artist profile at /@handle", () => {
  test("renders the header, service menu, portfolio and policies", async ({
    page,
  }) => {
    const { artistHandle } = await readFixture();

    const response = await page.goto(`/@${artistHandle}`);
    expect(response?.status()).toBe(200);
    // Served by the rewrite -- the browser URL stays on `/@handle`.
    await expect(page).toHaveURL(`http://localhost:3000/@${artistHandle}`);

    await expect(
      page.getByRole("heading", { level: 1, name: "E2E Fixture Artist" })
    ).toBeVisible();
    await expect(page.getByText(`@${artistHandle}`, { exact: true })).toBeVisible();

    await expect(page.getByRole("heading", { name: "Services" })).toBeVisible();
    await expect(page.getByRole("link", { name: /^Request / })).toHaveCount(4);
    await expect(page.getByRole("link", { name: "Request Tier 2" })).toHaveAttribute(
      "href",
      `/@${artistHandle}/book?service=TIER_2`
    );
    // global-setup seeds a £40 deposit for TIER_4 only.
    await expect(page.getByText("£40 deposit")).toBeVisible();

    await expect(page.getByRole("heading", { name: "Portfolio" })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Booking policies" })
    ).toBeVisible();

    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      `http://localhost:3000/@${artistHandle}`
    );
  });

  test("returns a themed 404 for an unknown handle", async ({ page }) => {
    const response = await page.goto("/@no_such_artist_e2e");

    expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
  });

  test("308-redirects an uppercase handle to its lowercase form", async ({
    request,
  }) => {
    const { artistHandle } = await readFixture();

    const response = await request.get(`/@${artistHandle.toUpperCase()}`, {
      maxRedirects: 0,
    });

    expect(response.status()).toBe(308);
    expect(response.headers()["location"]).toMatch(
      new RegExp(`/@${artistHandle}$`)
    );
  });

  test("is public: a request with no session cookie gets a 200", async ({
    request,
  }) => {
    const { artistHandle } = await readFixture();

    const response = await request.get(`/@${artistHandle}`, { maxRedirects: 0 });

    expect(response.status()).toBe(200);
  });

  test("matches the visual baseline", async ({ page }) => {
    const { artistHandle } = await readFixture();

    await page.goto(`/@${artistHandle}`);
    await expect(
      page.getByRole("heading", { level: 1, name: "E2E Fixture Artist" })
    ).toBeVisible();
    await page.waitForLoadState("networkidle");
    // The fixture portfolio URL is fake, so the broken-image rendering
    // varies by platform -- mask it; hide the Next dev indicator.
    await expect(page).toHaveScreenshot({
      fullPage: true,
      mask: [page.getByRole("img", { name: /example/ })],
      stylePath: path.join(__dirname, "screenshot.css"),
    });
  });
});
