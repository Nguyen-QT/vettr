import { readFile } from "node:fs/promises";
import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { loginAsArtist } from "./authHelpers";
import { loginAsClient } from "./authHelpers";
import type { E2eFixture } from "./global-setup";

const FIXTURE_PATH = path.join(__dirname, ".fixture.json");

async function readFixture(): Promise<E2eFixture> {
  const raw = await readFile(FIXTURE_PATH, "utf-8");
  return JSON.parse(raw);
}

async function openClientDashboard(page: Page, sessionId: string) {
  await loginAsClient(page, sessionId);
  await page.goto("/client");
  await expect(page).toHaveURL("http://localhost:3000/client");
}

test.describe("deposit amounts (artist settings)", () => {
  test("shows the seeded TIER_4 amount and persists an edit across reload", async ({
    page,
  }) => {
    const fixture = await readFixture();
    await loginAsArtist(page, fixture);

    await page.goto(`/artist/${fixture.artistId}/settings/deposits`);
    await page.waitForLoadState("networkidle");

    await expect(page.getByLabel("TIER_4")).toHaveValue("40");

    await page.getByLabel("TIER_3").fill("55");
    const tier3Row = page
      .getByLabel("TIER_3")
      .locator("xpath=ancestor::div[@data-slot='field']");
    await tier3Row.getByRole("button", { name: "Save" }).click();
    await page.waitForLoadState("networkidle");

    await page.reload();
    await page.waitForLoadState("networkidle");

    await expect(page.getByLabel("TIER_3")).toHaveValue("55");
  });
});

// Serial: both tests pay the same TIER_4 booking. In parallel, their
// creates could share one idempotency key while both are in flight, and
// Stripe would 409 the second, surfacing as the generic error (56.5).
test.describe("deposit payment (client dashboard)", () => {
  test.describe.configure({ mode: "serial" });

  // Only asserts the payment form loads (clientSecret fetched, Stripe
  // Elements mounted) -- actual card entry/submission happens inside a
  // Stripe-hosted iframe and needs the user's own manual click-through
  // in Stripe test mode (CLAUDE.md's Manual E2E Verification Gate).
  test("shows a Pay Deposit card for the eligible booking and loads the payment form", async ({
    page,
  }) => {
    const fixture = await readFixture();
    await openClientDashboard(page, fixture.clientLoginSessionId);

    const card = page.locator("article", { hasText: "TIER_4" });
    await expect(card.getByText("Deposit required: £40")).toBeVisible();

    await card.getByRole("button", { name: "Pay deposit" }).click();

    await expect(
      card.getByRole("button", { name: "Confirm payment" })
    ).toBeVisible({ timeout: 15_000 });
  });

  // Aborts the server action's POST in the browser, so the server never
  // sees it and the action call rejects (56.5.5.1). The card must fall
  // back to "Pay deposit" with the error, not a stuck loading state.
  test("shows the error and a retry button when the first request fails, then loads the form on retry", async ({
    page,
  }) => {
    const fixture = await readFixture();
    await openClientDashboard(page, fixture.clientLoginSessionId);

    await page.route("**/client", async (route) => {
      const request = route.request();
      if (request.method() === "POST" && request.headers()["next-action"]) {
        await route.abort();
        return;
      }
      await route.continue();
    });

    const card = page.locator("article", { hasText: "TIER_4" });
    const payButton = card.getByRole("button", { name: "Pay deposit" });
    const initError = card.getByText(
      "Something went wrong starting your deposit payment. Please try again."
    );

    await payButton.click();

    await expect(initError).toBeVisible();
    await expect(payButton).toBeEnabled();

    await page.unroute("**/client");
    await payButton.click();

    await expect(initError).toBeHidden();
    await expect(
      card.getByRole("button", { name: "Confirm payment" })
    ).toBeVisible({ timeout: 15_000 });
  });
});

test.describe("deposit refund status (client dashboard)", () => {
  test("shows 'Deposit refunded' on a cancelled booking whose deposit was refunded", async ({
    page,
  }) => {
    const fixture = await readFixture();
    await openClientDashboard(page, fixture.clientLoginSessionId);

    const card = page.locator("article", { hasText: "FREESTYLE" });
    await expect(card.getByText("Deposit refunded")).toBeVisible();
  });

  test("does not show a deposit status label on a booking with no deposit paid", async ({
    page,
  }) => {
    const fixture = await readFixture();
    await openClientDashboard(page, fixture.clientLoginSessionId);

    const card = page.locator("article", { hasText: "TIER_3" });
    await expect(card.getByText("Deposit refunded")).not.toBeVisible();
    await expect(card.getByText("Deposit paid")).not.toBeVisible();
  });
});
