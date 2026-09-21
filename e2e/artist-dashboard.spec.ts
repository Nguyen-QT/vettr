import { readFile } from "node:fs/promises";
import path from "node:path";

import { expect, test } from "@playwright/test";

import type { E2eFixture } from "./global-setup";

const FIXTURE_PATH = path.join(__dirname, ".fixture.json");

async function readFixture(): Promise<E2eFixture> {
  const raw = await readFile(FIXTURE_PATH, "utf-8");
  return JSON.parse(raw);
}

test.describe("artist dashboard approve/decline", () => {
  test("approving a request shows the response message", async ({ page }) => {
    const fixture = await readFixture();

    await page.goto(`/artist/${fixture.artistId}`);
    const card = page.locator("article", { hasText: fixture.approveClientHandle });

    await expect(card.getByText("e2e-client-approve@example.com")).toBeVisible();

    await card.getByLabel("Estimated price (£)").fill("150");
    await card.getByRole("button", { name: "Approve" }).click();

    await expect(card.getByText(/approved/i)).toBeVisible();
    await expect(
      card.getByRole("button", { name: /Copy message/ })
    ).toBeVisible();
  });

  test("declining a request shows the response message", async ({ page }) => {
    const fixture = await readFixture();

    await page.goto(`/artist/${fixture.artistId}`);
    const card = page.locator("article", { hasText: fixture.declineClientHandle });

    await card.getByRole("button", { name: "Decline" }).click();

    await expect(card.getByText(/not able to take/i)).toBeVisible();
    await expect(
      card.getByRole("button", { name: /Copy message/ })
    ).toBeVisible();
  });

  test("defaults the estimated price to TIER_2's minimum for a FREESTYLE request", async ({
    page,
  }) => {
    const fixture = await readFixture();

    await page.goto(`/artist/${fixture.artistId}`);
    const card = page.locator("article", {
      hasText: fixture.freestylePendingClientHandle,
    });

    await expect(card.getByLabel("Estimated price (£)")).toHaveValue("50");
  });

  test("confirming a proposed double-slot booking shows the approval message", async ({
    page,
  }) => {
    const fixture = await readFixture();

    await page.goto(`/artist/${fixture.artistId}`);
    const card = page.locator("article", {
      hasText: fixture.awaitingConfirmationClientHandle,
    });

    await expect(card.getByText(/double-slot booking/i)).toBeVisible();
    await card.getByRole("button", { name: "Confirm Booking" }).click();

    await expect(card.getByText(/approved/i)).toBeVisible();
    await expect(
      card.getByRole("button", { name: /Copy message/ })
    ).toBeVisible();
  });
});
