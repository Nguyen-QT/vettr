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

test.describe("cancellation history flag on RequestCard", () => {
  test("shows the flag for a client with cancellation history", async ({
    page,
  }) => {
    const fixture = await readFixture();
    await loginAsArtist(page, fixture);

    await page.goto(`/artist/${fixture.artistId}/requests`);
    const card = page.locator("article", { hasText: fixture.flaggedClientHandle });

    await expect(card.getByText("2 cancellations · Deposit required")).toBeVisible();
  });

  test("does not show the flag for a client with no cancellation history", async ({
    page,
  }) => {
    const fixture = await readFixture();
    await loginAsArtist(page, fixture);

    await page.goto(`/artist/${fixture.artistId}/requests`);
    const card = page.locator("article", { hasText: fixture.approveClientHandle });

    await expect(card.getByText(/cancellation/)).toHaveCount(0);
  });
});
