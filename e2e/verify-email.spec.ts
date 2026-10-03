import { readFile } from "node:fs/promises";
import path from "node:path";

import { expect, test } from "@playwright/test";

import { readCapturedCode } from "./authHelpers";
import { resetClientSignup } from "./dbHelpers";
import type { E2eFixture } from "./global-setup";

const FIXTURE_PATH = path.join(__dirname, ".fixture.json");

async function readFixture(): Promise<E2eFixture> {
  const raw = await readFile(FIXTURE_PATH, "utf-8");
  return JSON.parse(raw);
}

test.describe("client verify-email page", () => {
  test("renders the verification form", async ({ page }) => {
    await page.goto("/client/verify-email?email=visual@example.com");

    await expect(page.getByRole("heading", { name: "Verify your email" })).toBeVisible();
    // Wait for hydration so the screenshot (which injects a caret style
    // into inputs) can't race it and trip a dev-only mismatch warning.
    await expect(page.getByRole("button", { name: /Resend code in/ })).toBeVisible();
    await page.waitForLoadState("networkidle");
    // The resend countdown ticks every second -- mask it; the Next dev
    // indicator varies run to run -- hide it via stylePath.
    await expect(page).toHaveScreenshot({
      mask: [page.getByRole("button", { name: /Resend code/ })],
      stylePath: path.join(__dirname, "screenshot.css"),
    });
  });

  test("redirects to signup when the email param is missing", async ({ page }) => {
    await page.goto("/client/verify-email");
    await expect(page).toHaveURL(/\/client\/signup/);
  });

  test("shows an error for a wrong code and stays on the page", async ({ page }) => {
    await page.goto("/client/verify-email?email=wrong-code@example.com");
    await page.getByLabel("Verification code").fill("000000");
    await page.getByLabel("Password").fill("a-brand-new-password");
    await page.getByRole("button", { name: "Verify" }).click();

    await expect(page.locator("[data-slot='field-error']")).toBeVisible();
    await expect(page).toHaveURL(/\/client\/verify-email/);
  });

  test("signs up, verifies the emailed code and reaches the dashboard", async ({
    page,
  }) => {
    const fixture = await readFixture();
    await resetClientSignup(fixture.clientVerifyEmail);

    await page.goto("/client/signup");
    await page.getByLabel("Email").fill(fixture.clientVerifyEmail);
    await page.getByLabel("Password").fill("a-brand-new-password");
    await page.getByRole("button", { name: "Create account" }).click();

    await expect(page).toHaveURL(/\/client\/verify-email\?email=/);

    const code = await readCapturedCode(fixture.clientVerifyEmail);
    await page.getByLabel("Verification code").fill(code);
    await page.getByLabel("Password").fill("a-brand-new-password");
    await page.getByRole("button", { name: "Verify" }).click();

    await expect(page).toHaveURL("http://localhost:3000/client");
  });
});
