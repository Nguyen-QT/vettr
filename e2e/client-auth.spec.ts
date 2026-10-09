import { readFile } from "node:fs/promises";
import path from "node:path";

import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { readCapturedCode, readCapturedEmails } from "./authHelpers";
import { resetEmailOtpChallenge } from "./dbHelpers";
import type { E2eFixture } from "./global-setup";

const FIXTURE_PATH = path.join(__dirname, ".fixture.json");

async function readFixture(): Promise<E2eFixture> {
  const raw = await readFile(FIXTURE_PATH, "utf-8");
  return JSON.parse(raw);
}

// No Account at all -- never issued a code, so it writes no
// EmailOtpChallenge row and needs no reset.
const NO_ACCOUNT_EMAIL = "e2e-otp-no-account@example.com";

// Shown for every successful request whether or not a code was sent
// (ClientSignInForm's code step has no eligibility input).
const CODE_SENT_COPY = /has a client account with us, we've sent it a 6-digit code/;

// Drives the email step and waits for the code step. requestClientSignInCode
// awaits the sink write before its 1.5s-floored response, so once the code
// step shows, any code this request sent is already in the sink.
async function requestCode(page: Page, email: string): Promise<void> {
  // Hydrated before submitting -- a pre-hydration click would natively
  // submit the noValidate form instead of calling the action.
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Email me a code" }).click();
  await expect(page.getByText(CODE_SENT_COPY)).toBeVisible();
}

async function enterCode(page: Page, code: string): Promise<void> {
  await page.getByLabel("6-digit code").fill(code);
  await page.getByRole("button", { name: "Sign in" }).click();
}

// Passwordless sign-in (54.3.6.1), driving the real OTP screen with the
// code read back from the capture sink. Serial: every test here shares
// otpClientEmail's single EmailOtpChallenge row, so a parallel sibling's
// reset or cooldown would invalidate another test's code.
test.describe("client passwordless sign-in", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeEach(async () => {
    const fixture = await readFixture();
    await resetEmailOtpChallenge(fixture.otpClientEmail);
  });

  test("signs in with the emailed code and lands on the dashboard", async ({
    page,
  }) => {
    const fixture = await readFixture();

    await page.goto("/client/login");
    await requestCode(page, fixture.otpClientEmail);
    await enterCode(page, await readCapturedCode(fixture.otpClientEmail));

    await expect(page).toHaveURL("http://localhost:3000/client");
    await expect(page.getByRole("heading", { name: "Your bookings" })).toBeVisible();
  });

  test("rejects a wrong code and stays on the sign-in page", async ({ page }) => {
    const fixture = await readFixture();

    await page.goto("/client/login");
    await requestCode(page, fixture.otpClientEmail);
    const code = await readCapturedCode(fixture.otpClientEmail);
    await enterCode(page, code === "000000" ? "111111" : "000000");

    await expect(
      page.getByText("Incorrect or expired code. Request a new code and try again.")
    ).toBeVisible();
    await expect(page).toHaveURL(/\/client\/login/);
  });

  test("returns to the page the proxy bounced the visitor from", async ({ page }) => {
    const fixture = await readFixture();

    await page.goto("/client/profile");
    await expect(page).toHaveURL(/\/client\/login\?redirectTo=%2Fclient%2Fprofile/);
    await requestCode(page, fixture.otpClientEmail);
    await enterCode(page, await readCapturedCode(fixture.otpClientEmail));

    await expect(page).toHaveURL("http://localhost:3000/client/profile");
  });

  test("logging out clears the session and blocks the dashboard again", async ({
    page,
  }) => {
    const fixture = await readFixture();

    await page.goto("/client/login");
    await requestCode(page, fixture.otpClientEmail);
    await enterCode(page, await readCapturedCode(fixture.otpClientEmail));
    await expect(page).toHaveURL("http://localhost:3000/client");

    await page.getByRole("button", { name: "Log out" }).click();
    await expect(page).toHaveURL(/\/client\/login/);

    await page.goto("/client");
    await expect(page).toHaveURL(/\/client\/login/);
  });
});

test.describe("client sign-in privacy and layout", () => {
  // No account, and an ARTIST-home account (which must never be sent a
  // sign-in code): both get the eligible client's exact screen and no email.
  for (const variant of ["no account", "artist account"] as const) {
    test(`an ineligible address (${variant}) sees the same screen and is sent nothing`, async ({
      page,
    }) => {
      const fixture = await readFixture();
      const email = variant === "no account" ? NO_ACCOUNT_EMAIL : fixture.artistLoginEmail;

      await page.goto("/client/login");
      await requestCode(page, email);

      await expect(page.locator("[data-slot='field-error']")).toHaveCount(0);
      const sent = await readCapturedEmails();
      expect(sent.filter((record) => record.to === email)).toEqual([]);
    });
  }

  test("email step matches the visual baseline", async ({ page }) => {
    await page.goto("/client/login");

    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Email me a code" })).toBeVisible();
    // Wait for hydration so the screenshot's caret style can't race it;
    // the Next dev indicator is hidden via stylePath.
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveScreenshot({
      stylePath: path.join(__dirname, "screenshot.css"),
    });
  });

  // Reached with the no-account address so it writes no challenge row.
  test("code step matches the visual baseline", async ({ page }) => {
    await page.goto("/client/login");
    await requestCode(page, NO_ACCOUNT_EMAIL);

    await expect(page.getByRole("button", { name: /Resend code in/ })).toBeVisible();
    // The resend countdown ticks every second -- mask it.
    await expect(page).toHaveScreenshot({
      mask: [page.getByRole("button", { name: /Resend code/ })],
      stylePath: path.join(__dirname, "screenshot.css"),
    });
  });
});
