import { randomBytes } from "node:crypto";

import type { Page } from "@playwright/test";

import { readCapturedCode } from "./authHelpers";

// Step helpers for the booking wizard at /@handle/book, in its 54.5 order:
// Service -> Design & Budget -> Date & Slot -> Details & Verify. Each
// "complete" helper fills its step's minimum and clicks Next; the last step
// has no Next -- a guest finishes with verifyAndSubmit, a signed-in client
// with "Submit request".

// Mirrors the prisma ComplexityTier enum -- the tier radios are named by it.
type WizardTier = "TIER_2" | "TIER_3" | "TIER_4" | "FREESTYLE";

export interface WizardDetails {
  instagramHandle: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  email: string;
  phone: string;
}

// Picks the tier (or keeps the form's default) and advances to Intake.
export async function completeServiceStep(
  page: Page,
  { tier }: { tier?: WizardTier } = {}
) {
  if (tier) {
    await page.getByRole("radio", { name: tier }).check();
  }
  await page.getByRole("button", { name: "Next", exact: true }).click();
}

const MOCK_UPLOAD_ORIGIN = "https://mock-upload.e2e.test";
// next.config.ts's images.remotePatterns only allows utfs.io/*.ufs.sh
// -- the ufsUrl returned to the dropzone (and rendered via next/image
// once it's added to the form) must resolve on that same allow-listed
// host, or next/image throws a render-crashing "unconfigured host"
// error. The actual mock-upload.e2e.test host above is only ever used
// for the PUT request's own URL, which next/image never touches.
const MOCK_UFS_URL = "https://utfs.io/f/e2e-fixture-mock-upload.png";

// A 1x1 transparent PNG -- real enough for the dropzone's own
// client-side file-type/size checks; the actual network upload is
// mocked below, so the file's content past that point never matters.
const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

// Intercepts UploadThing's real network flow so a design reference
// image can be "uploaded" without a real UPLOADTHING_TOKEN or network
// access -- this environment only has a dummy token (see ci.yml), so
// an unmocked upload would fail regardless. Mirrors the three calls
// uploadthing's client SDK actually makes: the presigned-URL request
// (our own /api/uploadthing route), the HEAD range-check, and the PUT
// that returns the final { ufsUrl } payload the dropzone reads.
async function mockImageUploadNetwork(page: Page) {
  await page.route("**/api/uploadthing**", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        { url: `${MOCK_UPLOAD_ORIGIN}/put/mock-key`, key: "mock-key", customId: null },
      ]),
    });
  });

  await page.route(`${MOCK_UPLOAD_ORIGIN}/**`, async (route) => {
    if (route.request().method() === "HEAD") {
      await route.fulfill({ status: 200 });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ufsUrl: MOCK_UFS_URL,
        serverData: {},
        fileHash: "mock-hash",
      }),
    });
  });
}

// Uploads one mocked design reference image via the real dropzone
// input, so the Remove-image control (and Intake's own "Next" gate on
// designReferenceImageUrls, CLAUDE.md 17.1) sees a genuine, populated
// image list rather than an empty one.
async function uploadMockDesignReferenceImage(page: Page) {
  await mockImageUploadNetwork(page);
  await page.locator('input[type="file"]').setInputFiles({
    name: "reference.png",
    mimeType: "image/png",
    buffer: Buffer.from(TINY_PNG_BASE64, "base64"),
  });
  // Selecting a file only stages it -- the dropzone still needs an
  // explicit "Upload N file(s)" click to actually start uploading.
  await page.getByRole("button", { name: /^Upload \d+ file/ }).click();
  // Waits for the (mocked, effectively instant) upload to actually
  // resolve and the remove control to render, so the caller's next
  // step-navigation click doesn't race a still-in-flight upload.
  await page.getByRole("button", { name: "Remove image" }).waitFor();
}

// Picks the minimum Intake (Design & Budget) selection needed to satisfy
// its own "Next" gate -- a non-FREESTYLE tier requires at least one design
// tag, and at least one design reference image is always required -- and
// advances to Date & Slot.
export async function completeIntakeStep(page: Page) {
  await page.getByRole("checkbox", { name: "fine-line-detail" }).check();
  await uploadMockDesignReferenceImage(page);
  // Payment method preference (CLAUDE.md 23.1) is required -- the form
  // defaults to Card, so this is only explicit for clarity/robustness
  // against that default ever changing.
  await page.getByRole("radio", { name: "Card" }).check();
  await page.getByRole("button", { name: "Next", exact: true }).click();
}

// A future slot and advances to Details & Verify. The default date is
// one no fixture books, so the slot is always selectable.
export async function completeDateSlotStep(
  page: Page,
  { date = "2099-02-02", time = "14:00" }: { date?: string; time?: string } = {}
) {
  await page.getByLabel("Preferred date").fill(date);
  await page.getByRole("radio", { name: time }).check();
  await page.getByRole("button", { name: "Next", exact: true }).click();
}

// From a fresh /@handle/book landing (the Service step) to Details & Verify.
export async function goToDetailsStep(
  page: Page,
  { tier }: { tier?: WizardTier } = {}
) {
  await completeServiceStep(page, { tier });
  await completeIntakeStep(page);
  await completeDateSlotStep(page);
}

// Fills every Details & Verify field for a guest and returns what was
// used. No Next -- this is the last step. The phone stays blank by
// default: the form's draft resolver (54.5.6.1) treats it as not provided.
//
// The suffix is fresh on every call (and so on every retry): a reused
// address would sit in the 60s resend cooldown or hit the daily cap, which
// quietly sends no new code. The `e2e-` prefix matches global-setup's
// stale-fixture sweep, so the Account and ClientProfile a verified submit
// creates never outlive the next run. Lowercase, since the capture sink
// records the normalised address. 12 hex chars keep the handle at 25,
// inside INSTAGRAM_HANDLE_REGEX's 30.
export async function fillDetailsStep(
  page: Page,
  overrides: Partial<WizardDetails> = {}
): Promise<WizardDetails> {
  const unique = randomBytes(6).toString("hex");
  const details: WizardDetails = {
    instagramHandle: `wizard_guest_${unique}`,
    firstName: "Wizard",
    lastName: "Guest",
    dateOfBirth: "2000-01-01",
    email: `e2e-wizard-guest-${unique}@example.com`,
    phone: "",
    ...overrides,
  };

  await page.getByLabel("Instagram handle").fill(details.instagramHandle);
  await page.getByLabel("First name").fill(details.firstName);
  await page.getByLabel("Last name").fill(details.lastName);
  await page.getByLabel("Date of birth").fill(details.dateOfBirth);
  await page.getByLabel("Email").fill(details.email);
  await page.getByLabel("Phone (optional)").fill(details.phone);
  return details;
}

// Sends the guest's inline email code and waits for the code input. The
// input renders once the action returns, and the action awaits the sink
// write before returning -- so the code is already in the sink.
export async function requestBookingCode(page: Page) {
  await page.getByRole("button", { name: "Email me a code" }).click();
  await page.getByLabel("6-digit code").waitFor();
}

// Enters `code` and submits. The caller asserts the outcome.
export async function submitBookingCode(page: Page, code: string) {
  await page.getByLabel("6-digit code").fill(code);
  await page.getByRole("button", { name: "Verify and submit request" }).click();
}

// The guest's inline email code: sends it, reads it back from the e2e
// capture sink and submits. `email` must be the normalised address (as
// fillDetailsStep returns it). The caller asserts the outcome. Never point
// this at otpClientEmail/gateOtpClientEmail -- one challenge row per
// address, so a booking code would replace their sign-in code.
export async function verifyAndSubmit(page: Page, email: string) {
  await requestBookingCode(page);
  await submitBookingCode(page, await readCapturedCode(email));
}
