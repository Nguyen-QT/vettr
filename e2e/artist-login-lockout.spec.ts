import { readFile } from "node:fs/promises";
import path from "node:path";

import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { setArtistLoginLockout } from "./dbHelpers";
import type { E2eFixture } from "./global-setup";

const FIXTURE_PATH = path.join(__dirname, ".fixture.json");

async function readFixture(): Promise<E2eFixture> {
  const raw = await readFile(FIXTURE_PATH, "utf-8");
  return JSON.parse(raw);
}

const LOGIN_URL = "http://localhost:3000/artist/login";

// Mirrors src/domains/auth/constants.ts -- duplicated rather than imported,
// same reasoning as authHelpers.ts's SESSION_COOKIE_NAME.
const INVALID_CREDENTIALS_COPY = "Incorrect email or password.";

async function signIn(page: Page, email: string, password: string): Promise<void> {
  // Hydrated before submitting -- a pre-hydration click would natively
  // submit the form as a GET instead of calling loginAction.
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

// The artist lockout (28.11) through the real login page. Serial: both tests
// share lockoutArtistEmail's one Account row, and each seeds the state it
// needs first, so neither depends on run order or on global-setup.ts.
test.describe("artist login lockout", () => {
  test.describe.configure({ mode: "serial" });

  test("the 5th wrong password locks the account, and a correct one is then rejected with the same copy", async ({
    page,
  }) => {
    const fixture = await readFixture();
    await setArtistLoginLockout(fixture.lockoutArtistEmail, 4, null);

    await page.goto("/artist/login");
    await signIn(page, fixture.lockoutArtistEmail, "wrong-password");

    await expect(page.getByText(INVALID_CREDENTIALS_COPY)).toBeVisible();
    await expect(page).toHaveURL(LOGIN_URL);

    // Fresh page, so the alert asserted below can only come from this submit.
    await page.reload();
    await signIn(page, fixture.lockoutArtistEmail, fixture.lockoutArtistPassword);

    await expect(page.getByText(INVALID_CREDENTIALS_COPY)).toBeVisible();
    await expect(page).toHaveURL(LOGIN_URL);
  });

  test("an expired lock lets the correct password through", async ({ page }) => {
    const fixture = await readFixture();
    await setArtistLoginLockout(
      fixture.lockoutArtistEmail,
      5,
      new Date(Date.now() - 60_000)
    );

    await page.goto("/artist/login");
    await signIn(page, fixture.lockoutArtistEmail, fixture.lockoutArtistPassword);

    await expect(page).toHaveURL(`http://localhost:3000/artist/${fixture.lockoutArtistId}`);
  });
});
