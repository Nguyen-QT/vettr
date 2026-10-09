import { readFile } from "node:fs/promises";
import path from "node:path";

import { expect, test } from "@playwright/test";

import { loginAsClient } from "./authHelpers";
import type { E2eFixture } from "./global-setup";
import { goToDetailsStep } from "./wizardHelpers";

const FIXTURE_PATH = path.join(__dirname, ".fixture.json");

async function readFixture(): Promise<E2eFixture> {
  const raw = await readFile(FIXTURE_PATH, "utf-8");
  return JSON.parse(raw);
}

// The onboarding fields live on the wizard's last step, Details & Verify
// (54.5), which has no "Next": the whole draft is validated when a guest
// asks for their email code.
test.describe("client onboarding required fields", () => {
  test("requires first name, last name, and date of birth before sending a code", async ({
    page,
  }) => {
    const fixture = await readFixture();

    await page.goto(`/@${fixture.artistHandle}/book`);
    await page.waitForLoadState("networkidle");

    await goToDetailsStep(page);
    await page.getByRole("button", { name: "Email me a code" }).click();

    await expect(page.getByText("First name is required.")).toBeVisible();
    await expect(page.getByText("Last name is required.")).toBeVisible();
  });

  test("rejects a date of birth under the minimum age", async ({ page }) => {
    const fixture = await readFixture();
    const under18 = new Date();
    under18.setFullYear(under18.getFullYear() - 17);

    await page.goto(`/@${fixture.artistHandle}/book`);
    await page.waitForLoadState("networkidle");

    await goToDetailsStep(page);
    await page
      .getByLabel("Date of birth")
      .fill(under18.toISOString().slice(0, 10));
    await page.getByRole("button", { name: "Email me a code" }).click();

    await expect(
      page.getByText("You must be at least 18 years old to book.")
    ).toBeVisible();
    // Still on the request step -- no code was sent.
    await expect(page.getByLabel("6-digit code")).toHaveCount(0);
  });

  // A fully onboarded profile (CLAUDE.md 6.2) sees who they're booking as
  // from the first step, and its known fields arrive locked on the last.
  test("prefills and locks the onboarding fields for a signed-in client who already has them set", async ({
    page,
  }) => {
    const fixture = await readFixture();
    await loginAsClient(page, fixture.onboardedClientSessionId);

    await page.goto(`/@${fixture.artistHandle}/book`);
    await page.waitForLoadState("networkidle");

    await expect(
      page.getByText(`Booking as ${fixture.onboardedClientEmail}`)
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Not you? Log out" })).toBeVisible();

    await goToDetailsStep(page);

    const firstName = page.getByLabel("First name");
    const lastName = page.getByLabel("Last name");
    const dateOfBirth = page.getByLabel("Date of birth");

    await expect(firstName).toHaveValue("Jamie");
    await expect(lastName).toHaveValue("Rivera");
    await expect(dateOfBirth).toHaveValue("2000-01-01");
    await expect(firstName).toBeDisabled();
    await expect(lastName).toBeDisabled();
    await expect(dateOfBirth).toBeDisabled();
  });

  test("leaves the onboarding fields blank and editable for a signed-in client who predates 6.2", async ({
    page,
  }) => {
    const fixture = await readFixture();
    await loginAsClient(page, fixture.clientLoginSessionId);

    await page.goto(`/@${fixture.artistHandle}/book`);
    await page.waitForLoadState("networkidle");

    await goToDetailsStep(page);

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
