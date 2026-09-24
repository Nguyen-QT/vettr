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

// Picks the minimum Step 2 (Service, Budget & Canvas) selection needed
// to satisfy its own "Next" gate -- the default tier (TIER_2) requires
// at least one design tag -- and advances to Step 3. Doesn't touch
// design reference images: that field isn't part of Step 2's gate
// (see useBookingWizard's IMAGE_FIELD_STEP comment) since a real
// upload can't be driven in this e2e environment, same "out of scope"
// boundary this suite already draws elsewhere.
export async function completeServiceCanvasStep(page: Page) {
  await page.getByRole("checkbox", { name: "fine-line-detail" }).check();
  await page.getByRole("button", { name: "Next", exact: true }).click();
}
