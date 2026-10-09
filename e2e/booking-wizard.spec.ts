import { readFile } from "node:fs/promises";
import path from "node:path";

import { expect, test } from "@playwright/test";

import { loginAsClient } from "./authHelpers";
import type { E2eFixture } from "./global-setup";
import { fillDetailsStep, goToDetailsStep, verifyAndSubmit } from "./wizardHelpers";

const FIXTURE_PATH = path.join(__dirname, ".fixture.json");

async function readFixture(): Promise<E2eFixture> {
  const raw = await readFile(FIXTURE_PATH, "utf-8");
  return JSON.parse(raw);
}

test.describe("client booking wizard (CLAUDE.md 17.1)", () => {
  test("a guest can navigate the full wizard and submit a real request", async ({
    page,
  }) => {
    const fixture = await readFixture();

    await page.goto(`/@${fixture.artistHandle}/book`);
    await page.waitForLoadState("networkidle");

    // Intake's own "Next" gate requires at least one design reference
    // image (CLAUDE.md 17.1) -- completeIntakeStep uploads one via a
    // mocked UploadThing network flow (see wizardHelpers.ts), since a
    // real upload can't be driven in this environment.
    await goToDetailsStep(page);
    const { email } = await fillDetailsStep(page, {
      firstName: "Wanda",
      lastName: "Wizard",
    });
    // The guest proves their email inline (54.5); the phone is left blank.
    await verifyAndSubmit(page, email);

    await expect(
      page.getByRole("heading", { name: "Request submitted" })
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "View your bookings" })).toBeVisible();
  });

  // The locked-field interplay with 6.1/6.2 lives in
  // client-onboarding-fields.spec.ts; this covers the signed-in submit.
  test("a signed-in client submits without an email code", async ({ page }) => {
    const fixture = await readFixture();

    // Guards against a real, previously-shipped bug: the "Not you? Log
    // out" banner used to wrap its button in its own <form>, nested
    // inside the wizard's own outer <form> -- invalid HTML that Next.js
    // only flags as a console error/hydration warning, never a thrown
    // exception a DOM assertion alone would catch.
    const consoleErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });

    await loginAsClient(page, fixture.onboardedClientSessionId);

    await page.goto(`/@${fixture.artistHandle}/book`);
    await page.waitForLoadState("networkidle");

    await expect(
      page.getByText(`Booking as ${fixture.onboardedClientEmail}`)
    ).toBeVisible();

    await goToDetailsStep(page);

    // Not the phone: client-profile.spec.ts edits this client's phone in
    // parallel, so its lock state isn't fixed.
    await expect(page.getByLabel("First name")).toHaveValue("Jamie");
    await expect(page.getByLabel("First name")).toBeDisabled();
    await expect(page.getByText("Verify your email")).toHaveCount(0);

    await page.getByRole("button", { name: "Submit request" }).click();

    await expect(
      page.getByRole("heading", { name: "Request submitted" })
    ).toBeVisible();
    expect(
      consoleErrors.filter((text) => text.includes("cannot be a descendant"))
    ).toHaveLength(0);
  });

  test("going back to a previous step preserves what was already entered", async ({
    page,
  }) => {
    const fixture = await readFixture();

    await page.goto(`/@${fixture.artistHandle}/book`);
    await page.waitForLoadState("networkidle");

    await goToDetailsStep(page);
    await fillDetailsStep(page, { firstName: "Backy", lastName: "Steps" });

    // dispatchEvent, not click -- Next.js's own dev-mode tools
    // indicator is a fixed, high-z-index overlay anchored at the same
    // bottom-left corner as WizardActionBar's Back button in this
    // dev-server-backed e2e run, and a real (or force-simulated)
    // pointer click at that position actually lands on the overlay
    // instead. Dispatching the click event directly on the button
    // sidesteps that hit-testing entirely; it never renders in a
    // production build, so this is purely a test-environment
    // workaround, not evidence of a real click-target bug.
    await page.getByRole("button", { name: "Back" }).dispatchEvent("click");
    await expect(page.getByLabel("Preferred date")).toHaveValue("2099-02-02");

    await page.getByRole("button", { name: "Next", exact: true }).click();

    await expect(page.getByLabel("First name")).toHaveValue("Backy");
    await expect(page.getByLabel("Last name")).toHaveValue("Steps");
  });

  test("blocks jumping forward via the progress bar past a step that hasn't passed validation yet", async ({
    page,
  }) => {
    const fixture = await readFixture();

    await page.goto(`/@${fixture.artistHandle}/book`);
    await page.waitForLoadState("networkidle");

    // Still on Service, never clicked Next -- the progress bar's Step 3
    // chip must stay unreachable.
    await expect(
      page.getByRole("button", { name: "3", exact: true })
    ).toBeDisabled();

    await expect(page.getByText("Tier", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Preferred date")).not.toBeVisible();
  });

  test("the guest Details & Verify step matches the visual baseline", async ({
    page,
  }) => {
    const fixture = await readFixture();
    // Tall enough that the whole step fits above the fixed WizardActionBar
    // -- a viewport capture, since a full-page one paints that bar mid-form.
    await page.setViewportSize({ width: 1280, height: 1600 });

    await page.goto(`/@${fixture.artistHandle}/book`);
    await page.waitForLoadState("networkidle");

    await goToDetailsStep(page);
    await expect(page.getByText("Verify your email")).toBeVisible();
    // The step clicks may have scrolled; the baseline is the page top.
    await page.evaluate(() => window.scrollTo(0, 0));

    // stylePath hides the Next dev indicator. Fields left empty, so no
    // generated value lands in the image.
    await expect(page).toHaveScreenshot({
      stylePath: path.join(__dirname, "screenshot.css"),
    });
  });
});
