import { readFile } from "node:fs/promises";
import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

import type { E2eFixture } from "./global-setup";
import { completeContactDetailsStep, completeServiceCanvasStep } from "./wizardHelpers";

const FIXTURE_PATH = path.join(__dirname, ".fixture.json");

async function readFixture(): Promise<E2eFixture> {
  const raw = await readFile(FIXTURE_PATH, "utf-8");
  return JSON.parse(raw);
}

async function loginAsClient(page: Page, email: string, password: string) {
  await page.goto("/client/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL("http://localhost:3000/client");
}

test.describe("client booking wizard (CLAUDE.md 17.1)", () => {
  test("a guest can navigate the full wizard and submit a real request", async ({
    page,
  }) => {
    const fixture = await readFixture();

    await page.goto(`/book/${fixture.artistId}`);
    await page.waitForLoadState("networkidle");

    await completeContactDetailsStep(page, {
      firstName: "Wanda",
      lastName: "Wizard",
    });
    // Step 2's own "Next" gate requires at least one design reference
    // image (CLAUDE.md 17.1) -- completeServiceCanvasStep uploads one
    // via a mocked UploadThing network flow (see wizardHelpers.ts),
    // since a real upload can't be driven in this environment.
    await completeServiceCanvasStep(page);

    await page.getByLabel("Preferred date").fill("2099-02-02");
    await page.getByRole("radio", { name: "14:00" }).click();
    await page.getByRole("button", { name: "Next", exact: true }).click();

    // Review step recaps what was entered on earlier steps.
    await expect(page.getByText("Review your request")).toBeVisible();
    await expect(page.getByText("Wanda Wizard")).toBeVisible();

    await page.getByRole("button", { name: "Submit request" }).click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Submit request" })
      .click();

    await expect(page.getByText("Request submitted.")).toBeVisible();
  });

  // A fuller assertion of the same skip-Step-1 behavior (locked-field
  // interplay with 6.1/6.2) lives in client-onboarding-fields.spec.ts;
  // this covers it as one of the wizard's own core navigation rules.
  test("a signed-in client with a complete profile skips Step 1 entirely", async ({
    page,
  }) => {
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

    await loginAsClient(
      page,
      fixture.onboardedClientEmail,
      fixture.onboardedClientPassword
    );

    await page.goto(`/book/${fixture.artistId}`);
    await page.waitForLoadState("networkidle");

    await expect(page.getByText(/Booking as Jamie Rivera/)).toBeVisible();
    await expect(page.getByLabel("First name")).not.toBeVisible();

    expect(
      consoleErrors.filter((text) => text.includes("cannot be a descendant"))
    ).toHaveLength(0);
  });

  test("going back to a previous step preserves what was already entered", async ({
    page,
  }) => {
    const fixture = await readFixture();

    await page.goto(`/book/${fixture.artistId}`);
    await page.waitForLoadState("networkidle");

    await completeContactDetailsStep(page, {
      firstName: "Backy",
      lastName: "Steps",
    });

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

    await expect(page.getByLabel("First name")).toHaveValue("Backy");
    await expect(page.getByLabel("Last name")).toHaveValue("Steps");
  });

  test("blocks jumping forward via the progress bar past a step that hasn't passed validation yet", async ({
    page,
  }) => {
    const fixture = await readFixture();

    await page.goto(`/book/${fixture.artistId}`);
    await page.waitForLoadState("networkidle");

    // Still on Step 1, never clicked Next -- the progress bar's Step 3
    // chip must stay unreachable.
    await expect(
      page.getByRole("button", { name: "3", exact: true })
    ).toBeDisabled();

    await expect(page.getByLabel("First name")).toBeVisible();
    await expect(page.getByLabel("Preferred date")).not.toBeVisible();
  });
});
