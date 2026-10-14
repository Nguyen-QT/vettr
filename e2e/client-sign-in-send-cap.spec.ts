import { readFile } from "node:fs/promises";
import path from "node:path";

import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { readCapturedEmails } from "./authHelpers";
import { resetEmailOtpChallenge, seedEmailOtpChallengeAtSendCap } from "./dbHelpers";
import type { E2eFixture } from "./global-setup";

const FIXTURE_PATH = path.join(__dirname, ".fixture.json");

async function readFixture(): Promise<E2eFixture> {
  const raw = await readFile(FIXTURE_PATH, "utf-8");
  return JSON.parse(raw);
}

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

// Counted rather than checked for absence: global-setup.ts clears the sink
// once per run, so a UI mode re-run still holds the control's earlier code.
async function countSentTo(email: string): Promise<number> {
  const sent = await readCapturedEmails();
  return sent.filter((record) => record.to === email).length;
}

// The 10-per-24h send cap at the UI (28.11.6.2). The integration tier
// (auth.otp.integration.test.ts) proves the cap holds under bursts; this
// proves a capped address gets the same screen as a real send, and no code.
test.describe("client sign-in send cap", () => {
  test.beforeEach(async () => {
    const fixture = await readFixture();
    await seedEmailOtpChallengeAtSendCap(fixture.otpCapClientEmail);
  });

  test("a capped address sees the normal code screen and is sent nothing", async ({
    page,
  }) => {
    const { otpCapClientEmail: email } = await readFixture();
    const sentBefore = await countSentTo(email);

    await page.goto("/client/login");
    await requestCode(page, email);

    await expect(page.getByRole("button", { name: /Resend code in/ })).toBeVisible();
    await expect(page.locator("[data-slot='field-error']")).toHaveCount(0);
    expect(await countSentTo(email)).toBe(sentBefore);

    // Control: with the cap cleared, the same address is sent a code, so the
    // silence above came from the cap and not from an ineligible fixture.
    // Polled because a send that overruns its 1s timeout lands late.
    await resetEmailOtpChallenge(email);
    await page.goto("/client/login");
    await requestCode(page, email);

    await expect.poll(() => countSentTo(email)).toBe(sentBefore + 1);
  });
});
