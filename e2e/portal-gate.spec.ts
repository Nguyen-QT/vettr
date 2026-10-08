import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { expect, test } from "@playwright/test";

import {
  loginAsArtist,
  loginAsClient,
  loginWithSessionId,
  readCapturedCode,
} from "./authHelpers";
import { resetEmailOtpChallenge } from "./dbHelpers";
import type { E2eFixture } from "./global-setup";

const FIXTURE_PATH = path.join(__dirname, ".fixture.json");

async function readFixture(): Promise<E2eFixture> {
  const raw = await readFile(FIXTURE_PATH, "utf-8");
  return JSON.parse(raw);
}

// Shown for every successful code request (ClientSignInForm's code step).
const CODE_SENT_COPY = /has a client account with us, we've sent it a 6-digit code/;

// Private Portal Gate (54.4.6.1): no public directory -- a signed-out
// visitor finds their artist by handle, signs in as a client by email
// code, or follows the artist sign-in link; a signed-in visitor is
// redirected by Session.activeRole.
test.describe("private portal gate at /", () => {
  test("shows the finder, client sign-in and artist sign-in to a signed-out visitor", async ({
    page,
  }) => {
    await page.goto("/");

    await expect(page.getByRole("heading", { level: 1, name: "Vettr" })).toBeVisible();
    await expect(
      page.getByRole("region", { name: "Find your artist" }).getByLabel("Artist handle")
    ).toBeVisible();
    await expect(
      page.getByRole("region", { name: "Client sign in" }).getByLabel("Email")
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Artist sign in" })).toHaveAttribute(
      "href",
      "/artist/login"
    );
    // No public marketplace directory from the front door.
    await expect(page.locator('a[href="/artists"]')).toHaveCount(0);
  });

  test("finding an artist by handle opens their public profile", async ({ page }) => {
    const { artistHandle } = await readFixture();

    await page.goto("/");
    // Hydrated before submitting -- a pre-hydration click would natively
    // submit the noValidate form instead of running useFindArtist.
    await page.waitForLoadState("networkidle");
    // A typed "@" and uppercase are normalised by useFindArtist.
    await page.getByLabel("Artist handle").fill(`@${artistHandle.toUpperCase()}`);
    await page.getByRole("button", { name: "Find artist" }).click();

    await expect(page).toHaveURL(`http://localhost:3000/@${artistHandle}`);
    await expect(
      page.getByRole("heading", { level: 1, name: "E2E Fixture Artist" })
    ).toBeVisible();
  });

  test("an invalid handle shows an error and stays on the gate", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.getByLabel("Artist handle").fill("not a handle!");
    await page.getByRole("button", { name: "Find artist" }).click();

    await expect(page.getByText("Enter a valid handle.")).toBeVisible();
    await expect(page).toHaveURL("http://localhost:3000/");
  });

  test("a client signs in inline with an emailed code and lands on the dashboard", async ({
    page,
  }) => {
    const { gateOtpClientEmail } = await readFixture();
    // Clears any cooldown/attempts left by a retry or a UI-mode re-run.
    await resetEmailOtpChallenge(gateOtpClientEmail);

    await page.goto("/");
    await page.waitForLoadState("networkidle");
    const signIn = page.getByRole("region", { name: "Client sign in" });
    await signIn.getByLabel("Email").fill(gateOtpClientEmail);
    await signIn.getByRole("button", { name: "Email me a code" }).click();
    await expect(signIn.getByText(CODE_SENT_COPY)).toBeVisible();

    await signIn.getByLabel("6-digit code").fill(await readCapturedCode(gateOtpClientEmail));
    await signIn.getByRole("button", { name: "Sign in" }).click();

    await expect(page).toHaveURL("http://localhost:3000/client");
    await expect(page.getByRole("heading", { name: "Your bookings" })).toBeVisible();
  });

  test("redirects a signed-in client to their dashboard", async ({ page }) => {
    const fixture = await readFixture();
    await loginAsClient(page, fixture.clientLoginSessionId);

    await page.goto("/");

    await expect(page).toHaveURL("http://localhost:3000/client");
  });

  // The account's home role is ARTIST; only the session's activeRole says
  // client view -- the redirect must follow activeRole.
  test("redirects a dual-role account in client view to /client, not its artist dashboard", async ({
    page,
  }) => {
    const fixture = await readFixture();
    await loginWithSessionId(page, fixture.dualRoleClientViewSessionId);

    await page.goto("/");

    await expect(page).toHaveURL("http://localhost:3000/client");
  });

  test("redirects a dual-role account in artist view to its artist dashboard", async ({
    page,
  }) => {
    const fixture = await readFixture();
    await loginWithSessionId(page, fixture.dualRoleArtistViewSessionId);

    await page.goto("/");

    await expect(page).toHaveURL(`http://localhost:3000/artist/${fixture.dualRoleArtistId}`);
  });

  test("redirects a signed-in artist to their dashboard", async ({ page }) => {
    const fixture = await readFixture();
    await loginAsArtist(page, fixture);

    await page.goto("/");

    await expect(page).toHaveURL(`http://localhost:3000/artist/${fixture.artistId}`);
  });

  test("shows the gate for a cookie with no live session behind it", async ({ page }) => {
    await loginWithSessionId(page, randomUUID());

    await page.goto("/");

    await expect(page).toHaveURL("http://localhost:3000/");
    await expect(page.getByRole("region", { name: "Find your artist" })).toBeVisible();
  });

  test("matches the visual baseline", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("heading", { level: 1, name: "Vettr" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Email me a code" })).toBeVisible();
    // Wait for hydration so the screenshot's caret style can't race it;
    // the Next dev indicator is hidden via stylePath.
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveScreenshot({
      fullPage: true,
      stylePath: path.join(__dirname, "screenshot.css"),
    });
  });
});
