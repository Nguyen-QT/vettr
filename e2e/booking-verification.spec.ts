import { readFile } from "node:fs/promises";
import path from "node:path";

import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { readCapturedCode } from "./authHelpers";
import { resetClientBookingRequests, resetEmailOtpChallenge } from "./dbHelpers";
import type { E2eFixture } from "./global-setup";
import {
  fillDetailsStep,
  goToDetailsStep,
  requestBookingCode,
  submitBookingCode,
  verifyAndSubmit,
} from "./wizardHelpers";

const FIXTURE_PATH = path.join(__dirname, ".fixture.json");

async function readFixture(): Promise<E2eFixture> {
  const raw = await readFile(FIXTURE_PATH, "utf-8");
  return JSON.parse(raw);
}

// Mirror src/domains/auth/constants.ts -- duplicated rather than imported,
// same reasoning as authHelpers.ts's SESSION_COOKIE_NAME.
const INVALID_CODE_COPY =
  "Incorrect or expired code. Request a new code and try again.";
const ARTIST_ONLY_COPY =
  "This email belongs to an artist account. Sign in as an artist and set up your client profile to request this booking.";

// From a fresh /@handle/book landing to Details & Verify.
async function openDetailsStep(page: Page, artistHandle: string): Promise<void> {
  await page.goto(`/@${artistHandle}/book`);
  await page.waitForLoadState("networkidle");
  await goToDetailsStep(page);
}

// Follows the confirmation's link and asserts the session reached the client
// dashboard (the proxy bounces a signed-out visitor to /client/login) with
// exactly this one request listed.
async function expectSingleBookingOnDashboard(page: Page): Promise<void> {
  await page.getByRole("link", { name: "View your bookings" }).click();

  await expect(page).toHaveURL("http://localhost:3000/client");
  await expect(page.getByRole("heading", { name: "Your bookings" })).toBeVisible();
  const bookings = page.getByRole("article");
  await expect(bookings).toHaveCount(1);
  await expect(bookings).toContainText("E2E Fixture Artist");
  await expect(bookings).toContainText("Pending review");
}

// The guest email-code outcomes (54.5.6.2), past booking-wizard.spec.ts's
// happy path. Parallel-safe: each fixed address belongs to one test and is
// reset at its start; every other address is fresh per fillDetailsStep call.
test.describe("booking email verification", () => {
  test("a new guest ends signed in with the booking on their dashboard", async ({
    page,
  }) => {
    const fixture = await readFixture();

    await openDetailsStep(page, fixture.artistHandle);
    const { email } = await fillDetailsStep(page);
    await verifyAndSubmit(page, email);

    await expect(page.getByRole("heading", { name: "Request submitted" })).toBeVisible();
    await expectSingleBookingOnDashboard(page);
  });

  test("an existing client's email verifies by code and the booking attaches to them", async ({
    page,
  }) => {
    const fixture = await readFixture();
    await resetEmailOtpChallenge(fixture.bookingOtpClientEmail);
    await resetClientBookingRequests(fixture.bookingOtpClientEmail);

    await openDetailsStep(page, fixture.artistHandle);
    await fillDetailsStep(page, {
      email: fixture.bookingOtpClientEmail,
      instagramHandle: fixture.bookingOtpClientHandle,
    });
    await verifyAndSubmit(page, fixture.bookingOtpClientEmail);

    await expect(page.getByRole("heading", { name: "Request submitted" })).toBeVisible();
    // The fixture starts with no bookings, so one card means this request
    // landed on the existing profile the session belongs to.
    await expectSingleBookingOnDashboard(page);
  });

  test("rejects a wrong code and keeps the draft for the right one", async ({
    page,
  }) => {
    const fixture = await readFixture();

    await openDetailsStep(page, fixture.artistHandle);
    const { email } = await fillDetailsStep(page);
    await requestBookingCode(page);
    const code = await readCapturedCode(email);

    await submitBookingCode(page, code === "000000" ? "111111" : "000000");

    await expect(page.getByText(INVALID_CODE_COPY)).toBeVisible();
    await expect(page.getByRole("heading", { name: "Request submitted" })).toHaveCount(0);

    // One miss is under the attempt cap, so the emailed code still works.
    await submitBookingCode(page, code);

    await expect(page.getByRole("heading", { name: "Request submitted" })).toBeVisible();
  });

  test("an artist's email gets the post-proof message and no session", async ({
    page,
  }) => {
    const fixture = await readFixture();
    await resetEmailOtpChallenge(fixture.bookingOtpArtistEmail);

    await openDetailsStep(page, fixture.artistHandle);
    await fillDetailsStep(page, { email: fixture.bookingOtpArtistEmail });
    await verifyAndSubmit(page, fixture.bookingOtpArtistEmail);

    await expect(page.getByText(ARTIST_ONLY_COPY)).toBeVisible();
    await expect(page.getByRole("heading", { name: "Request submitted" })).toHaveCount(0);

    await page.goto("/client");
    await expect(page).toHaveURL(/\/client\/login/);
  });
});
