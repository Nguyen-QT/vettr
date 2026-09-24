import { readFile } from "node:fs/promises";
import path from "node:path";

import { expect, test } from "@playwright/test";

import type { E2eFixture } from "./global-setup";
import { completeContactDetailsStep, completeServiceCanvasStep } from "./wizardHelpers";

const FIXTURE_PATH = path.join(__dirname, ".fixture.json");

async function readFixture(): Promise<E2eFixture> {
  const raw = await readFile(FIXTURE_PATH, "utf-8");
  return JSON.parse(raw);
}

// Scoped to what 4.1e actually changed: the new preferred date/time
// fields. A full successful-submission test would also need to drive
// UploadThing's real upload flow, which is out of scope here.
test.describe("client booking form -- requested slot", () => {
  test("shows the preferred date and fixed daily time options", async ({
    page,
  }) => {
    const fixture = await readFixture();

    await page.goto(`/book/${fixture.artistId}`);
    await page.waitForLoadState("networkidle");

    await completeContactDetailsStep(page);
    await completeServiceCanvasStep(page);

    await expect(page.getByLabel("Preferred date")).toBeVisible();
    await expect(page.getByText("11:00")).toBeVisible();
    await expect(page.getByText("14:00")).toBeVisible();
    await expect(page.getByText("17:30")).toBeVisible();
  });

  test("shows the design reference dropzone with no remove controls when empty", async ({
    page,
  }) => {
    const fixture = await readFixture();

    await page.goto(`/book/${fixture.artistId}`);
    await page.waitForLoadState("networkidle");

    await completeContactDetailsStep(page);

    // Full add/remove/preview coverage (CLAUDE.md 13.1) needs a real
    // uploaded image to interact with, which needs driving UploadThing's
    // actual upload flow -- out of scope here, same as this file's other
    // upload-dependent tests. 13.2 (editing an existing PENDING request)
    // seeds real DesignReference rows via fixture SQL rather than a real
    // upload, so full remove/preview interaction is covered there instead.
    await expect(page.getByRole("button", { name: "Remove image" })).toHaveCount(0);
  });

  test("shows the 'How booking works' explainer (CLAUDE.md 12.1)", async ({
    page,
  }) => {
    const fixture = await readFixture();

    await page.goto(`/book/${fixture.artistId}`);
    await page.waitForLoadState("networkidle");

    // Rendered by the page itself above the wizard (unaffected by
    // Phase 17), so it's visible before any step navigation.
    await expect(page.getByText("How booking works")).toBeVisible();
    await expect(page.getByText("Submit your request")).toBeVisible();
    await expect(page.getByText("Pay your deposit")).toBeVisible();
  });

  test("rejects a preferred date/time in the past on Step 3's Next", async ({
    page,
  }) => {
    const fixture = await readFixture();

    await page.goto(`/book/${fixture.artistId}`);
    // Wait for hydration before the first interaction -- filling an input
    // before Next.js attaches its event handlers silently drops the fill.
    await page.waitForLoadState("networkidle");

    await completeContactDetailsStep(page);
    await completeServiceCanvasStep(page);

    await page.getByLabel("Preferred date").fill("2020-01-01");
    // Step 3 (Date & Slot)'s own "Next" gate already validates
    // requestedDate, so the error surfaces without needing to reach
    // the review step's Submit button.
    await page.getByRole("button", { name: "Next", exact: true }).click();

    await expect(
      page.getByText("Choose a date and time in the future.")
    ).toBeVisible();
  });

  test("requires an email address to advance past Step 1", async ({ page }) => {
    const fixture = await readFixture();

    await page.goto(`/book/${fixture.artistId}`);
    await page.waitForLoadState("networkidle");

    await page.getByLabel("First name").fill("Test");
    await page.getByLabel("Last name").fill("Client");
    await page.getByLabel("Date of birth").fill("2000-01-01");
    await page.getByLabel("Instagram handle").fill("test_client_no_email");
    await page.getByRole("button", { name: "Next", exact: true }).click();

    await expect(page.getByText("Enter a valid email address.")).toBeVisible();
    // Still on Step 1 -- Step 3's own field never rendered.
    await expect(page.getByLabel("Preferred date")).not.toBeVisible();
  });

  test("shows the tier reference gallery for the default tier and hides it for a tier with no examples", async ({
    page,
  }) => {
    const fixture = await readFixture();

    await page.goto(`/book/${fixture.artistId}`);
    await page.waitForLoadState("networkidle");

    await completeContactDetailsStep(page);

    // TIER_2 is the form's default and the only tier the fixture
    // seeded an example image for.
    await expect(page.getByText("Examples of TIER_2 work")).toBeVisible();

    await page.getByRole("radio", { name: "TIER_3" }).click();

    await expect(page.getByText("Examples of TIER_2 work")).not.toBeVisible();
    await expect(page.getByText(/Examples of TIER_3 work/)).not.toBeVisible();
  });

  test("disables an already-booked time once a booked date is picked", async ({
    page,
  }) => {
    const fixture = await readFixture();

    await page.goto(`/book/${fixture.artistId}`);
    await page.waitForLoadState("networkidle");

    await completeContactDetailsStep(page);
    await completeServiceCanvasStep(page);

    await page.getByLabel("Preferred date").fill(fixture.bookedSlotDate);

    const bookedTimeRadio = page.getByRole("radio", {
      name: new RegExp(`^${fixture.bookedSlotTime}`),
    });
    await expect(bookedTimeRadio).toBeDisabled();
    await expect(page.getByText(`${fixture.bookedSlotTime} (unavailable)`)).toBeVisible();

    // A different time on the same date stays selectable.
    const otherTime = fixture.bookedSlotTime === "11:00" ? "14:00" : "11:00";
    await expect(
      page.getByRole("radio", { name: new RegExp(`^${otherTime}`) })
    ).toBeEnabled();
  });

  test("does not submit the form when Enter is pressed in a text field", async ({
    page,
  }) => {
    const fixture = await readFixture();

    await page.goto(`/book/${fixture.artistId}`);
    await page.waitForLoadState("networkidle");

    await completeContactDetailsStep(page);
    await completeServiceCanvasStep(page);

    await page.getByLabel("Preferred date").fill("2099-01-01");
    await page.getByLabel("Preferred date").press("Enter");

    // A real submit (there's no submit button until the review step)
    // would have navigated away from Step 3 entirely -- its own
    // fields, and the still-present "Next" control, confirm Enter
    // didn't trigger anything.
    await expect(page.getByLabel("Preferred date")).toBeVisible();
    await expect(page.getByRole("button", { name: "Next", exact: true })).toBeVisible();
  });
});
