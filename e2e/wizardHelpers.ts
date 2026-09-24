import type { Page } from "@playwright/test";

// Fills every Step 1 (Contact Details) field with valid defaults
// (callers can override any of them) and advances to Step 2 -- shared
// by every spec that needs to reach a later step as a guest, since
// Step 1 only skips itself entirely for a signed-in client with a
// complete profile (CLAUDE.md 17.1).
export async function completeContactDetailsStep(
  page: Page,
  overrides: Partial<{
    firstName: string;
    lastName: string;
    dateOfBirth: string;
    email: string;
    phone: string;
    instagramHandle: string;
  }> = {}
) {
  // INSTAGRAM_HANDLE_REGEX only allows letters/digits/periods/
  // underscores (no hyphens) up to 30 chars total, so the uniqueness
  // suffix below stays short and digits-only.
  const unique = `${Date.now() % 1_000_000}`;
  const details = {
    firstName: "Wizard",
    lastName: "Guest",
    dateOfBirth: "2000-01-01",
    email: `wizard-guest-${unique}@example.com`,
    // clientBookingInputSchema's phone field rejects a blank string --
    // only a genuinely omitted value passes -- but react-hook-form
    // registers this input with a "" default, not undefined, so a
    // real, pre-existing (not introduced by the wizard) gap leaves an
    // untouched phone field unable to pass validation at all. Always
    // filling it here sidesteps that instead of masking it.
    phone: "+1 555 0100",
    instagramHandle: `wizard_guest_${unique}`,
    ...overrides,
  };

  await page.getByLabel("First name").fill(details.firstName);
  await page.getByLabel("Last name").fill(details.lastName);
  await page.getByLabel("Date of birth").fill(details.dateOfBirth);
  await page.getByLabel("Email").fill(details.email);
  await page.getByLabel("Phone (optional)").fill(details.phone);
  await page.getByLabel("Instagram handle").fill(details.instagramHandle);
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
// input, so the Remove-image control (and Step 2's own "Next" gate on
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

// Picks the minimum Step 2 (Service, Budget & Canvas) selection needed
// to satisfy its own "Next" gate -- the default tier (TIER_2) requires
// at least one design tag, and at least one design reference image is
// always required -- and advances to Step 3.
export async function completeServiceCanvasStep(page: Page) {
  await page.getByRole("checkbox", { name: "fine-line-detail" }).check();
  await uploadMockDesignReferenceImage(page);
  await page.getByRole("button", { name: "Next", exact: true }).click();
}
