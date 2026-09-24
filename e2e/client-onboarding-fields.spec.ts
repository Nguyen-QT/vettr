import { readFile } from "node:fs/promises";
import path from "node:path";

import { expect, test } from "@playwright/test";

import type { E2eFixture } from "./global-setup";

const FIXTURE_PATH = path.join(__dirname, ".fixture.json");

async function readFixture(): Promise<E2eFixture> {
  const raw = await readFile(FIXTURE_PATH, "utf-8");
  return JSON.parse(raw);
}

async function loginAsClient(
  page: import("@playwright/test").Page,
  email: string,
  password: string
) {
  await page.goto("/client/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL("http://localhost:3000/client");
}

test.describe("client onboarding required fields", () => {
  test("requires first name, last name, and date of birth to advance past Step 1", async ({
    page,
  }) => {
    const fixture = await readFixture();

    await page.goto(`/book/${fixture.artistId}`);
    await page.waitForLoadState("networkidle");

    await page.getByRole("button", { name: "Next", exact: true }).click();

    await expect(page.getByText("First name is required.")).toBeVisible();
    await expect(page.getByText("Last name is required.")).toBeVisible();
  });

  test("rejects a date of birth under the minimum age", async ({ page }) => {
    const fixture = await readFixture();
    const under18 = new Date();
    under18.setFullYear(under18.getFullYear() - 17);

    await page.goto(`/book/${fixture.artistId}`);
    await page.waitForLoadState("networkidle");

    await page
      .getByLabel("Date of birth")
      .fill(under18.toISOString().slice(0, 10));
    await page.getByRole("button", { name: "Next", exact: true }).click();

    await expect(
      page.getByText("You must be at least 18 years old to book.")
    ).toBeVisible();
  });

  // A fully onboarded profile (CLAUDE.md 6.2) skips Step 1 entirely
  // (CLAUDE.md 17.1) -- there's no "locked" Step 1 to land on, only the
  // compact "Booking as ..." banner and an immediate landing on Step 2.
  test("skips Step 1 for a signed-in client who already has onboarding fields set", async ({
    page,
  }) => {
    const fixture = await readFixture();
    await loginAsClient(
      page,
      fixture.onboardedClientEmail,
      fixture.onboardedClientPassword
    );

    await page.goto(`/book/${fixture.artistId}`);
    await page.waitForLoadState("networkidle");

    await expect(
      page.getByText("Booking as Jamie Rivera (e2e-client-onboarded@example.com)")
    ).toBeVisible();
    // Landed straight on Step 2 -- its Tier field is visible immediately,
    // and none of Step 1's fields are rendered at all to lock.
    await expect(page.getByText("Tier", { exact: true })).toBeVisible();
    await expect(page.getByLabel("First name")).not.toBeVisible();
  });

  test("leaves the onboarding fields blank and editable for a signed-in client who predates 6.2", async ({
    page,
  }) => {
    const fixture = await readFixture();
    await loginAsClient(page, fixture.clientLoginEmail, fixture.clientLoginPassword);

    await page.goto(`/book/${fixture.artistId}`);
    await page.waitForLoadState("networkidle");

    const firstName = page.getByLabel("First name");
    const lastName = page.getByLabel("Last name");
    const dateOfBirth = page.getByLabel("Date of birth");

    await expect(firstName).toHaveValue("");
    await expect(lastName).toHaveValue("");
    await expect(dateOfBirth).toHaveValue("");
    await expect(firstName).toBeEnabled();
    await expect(lastName).toBeEnabled();
    await expect(dateOfBirth).toBeEnabled();
  });
});
