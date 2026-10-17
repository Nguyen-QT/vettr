import { readFile } from "node:fs/promises";
import path from "node:path";

import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { readCapturedEmails, readCapturedResetLink } from "./authHelpers";
import { restoreArtistResetFixture, setArtistLoginLockout } from "./dbHelpers";
import type { E2eFixture } from "./global-setup";

const FIXTURE_PATH = path.join(__dirname, ".fixture.json");

async function readFixture(): Promise<E2eFixture> {
  const raw = await readFile(FIXTURE_PATH, "utf-8");
  return JSON.parse(raw);
}

// Mirror src/domains/auth/constants.ts -- duplicated rather than imported,
// same reasoning as authHelpers.ts's SESSION_COOKIE_NAME.
const INVALID_CREDENTIALS_COPY = "Incorrect email or password.";
const INVALID_LINK_COPY = "This reset link is invalid or has expired. Request a new one.";

// Shown for every successful request, whether or not a link was sent
// (ArtistForgotPasswordForm's "sent" step has no eligibility input).
const LINK_SENT_COPY =
  /belongs to an artist account, we've sent it a reset link\. It expires in 1 hour; use the newest one\./;

// Well-formed (43 base64url chars) but never issued, so it can only reach the
// form step and never redeem anything.
const WELL_FORMED_UNISSUED_TOKEN = "A".repeat(43);

const NEW_PASSWORD = "e2e-brand-new-password-456";

async function signIn(page: Page, email: string, password: string): Promise<void> {
  // Hydrated before submitting -- a pre-hydration click would natively
  // submit the form as a GET instead of calling loginAction.
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

// Drives the forgot-password form and waits for the "sent" step.
// requestArtistPasswordReset awaits the sink write before its 1.5s-floored
// response, so once the "sent" step shows, any link this request sent is
// already in the sink.
async function requestResetLink(page: Page, email: string): Promise<void> {
  // Hydrated before submitting -- a pre-hydration click would natively
  // submit the noValidate form instead of calling the action.
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByText(LINK_SENT_COPY)).toBeVisible();
  await expect(page.locator("[data-slot='field-error']")).toHaveCount(0);
}

// Opens the newest captured link by path and query only -- NEXT_PUBLIC_APP_URL
// may name another host than the one Playwright drives.
async function openResetLink(page: Page, email: string): Promise<void> {
  const { pathname, search } = new URL(await readCapturedResetLink(email));
  await page.goto(`${pathname}${search}`);
}

async function setNewPassword(page: Page, password: string, confirm: string): Promise<void> {
  await page.waitForLoadState("networkidle");
  // exact: a substring match would also hit "Confirm new password".
  await page.getByLabel("New password", { exact: true }).fill(password);
  await page.getByLabel("Confirm new password").fill(confirm);
  await page.getByRole("button", { name: "Set new password" }).click();
}

// The artist password reset (71.1) through the real pages. Serial: every test
// here shares resetArtistEmail's one Account row, and beforeEach restores its
// password, lock and links, so none depends on run order or on global-setup.ts.
test.describe("artist password reset", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeEach(async () => {
    const fixture = await readFixture();
    await restoreArtistResetFixture(fixture.resetArtistEmail, fixture.resetArtistPassword);
  });

  test("a locked artist requests a link, sets a new password and lands on the dashboard", async ({
    page,
  }) => {
    const fixture = await readFixture();
    await setArtistLoginLockout(
      fixture.resetArtistEmail,
      5,
      new Date(Date.now() + 15 * 60_000)
    );

    await page.goto("/artist/login");
    await signIn(page, fixture.resetArtistEmail, fixture.resetArtistPassword);
    await expect(page.getByText(INVALID_CREDENTIALS_COPY)).toBeVisible();

    await page.getByRole("link", { name: "Forgot password?" }).click();
    await expect(page).toHaveURL("http://localhost:3000/artist/forgot-password");
    await requestResetLink(page, fixture.resetArtistEmail);

    await openResetLink(page, fixture.resetArtistEmail);
    await expect(page.locator('meta[name="referrer"]')).toHaveAttribute("content", "no-referrer");

    // The policy must hold on the wire too: the redeeming POST carries the
    // token, so a Referer from this URL would leak it.
    const resetRequest = page.waitForRequest(
      (request) =>
        request.method() === "POST" && new URL(request.url()).pathname === "/artist/reset-password"
    );
    await setNewPassword(page, NEW_PASSWORD, NEW_PASSWORD);
    expect((await (await resetRequest).allHeaders())["referer"]).toBeUndefined();

    await expect(page).toHaveURL(`http://localhost:3000/artist/${fixture.resetArtistId}`);

    // Log out lives in the avatar menu (50.1.6.1).
    await page.getByRole("button", { name: "Account menu" }).click();
    await page.getByRole("menuitem", { name: "Log out" }).click();
    await expect(page).toHaveURL(/\/artist\/login/);

    await signIn(page, fixture.resetArtistEmail, fixture.resetArtistPassword);
    await expect(page.getByText(INVALID_CREDENTIALS_COPY)).toBeVisible();

    // Fresh page, so the alert asserted above can't be mistaken for this one.
    await page.reload();
    await signIn(page, fixture.resetArtistEmail, NEW_PASSWORD);
    await expect(page).toHaveURL(`http://localhost:3000/artist/${fixture.resetArtistId}`);
  });

  test("a used link shows the invalid state with a way to request a new one", async ({
    page,
  }) => {
    const fixture = await readFixture();

    await page.goto("/artist/forgot-password");
    await requestResetLink(page, fixture.resetArtistEmail);
    await openResetLink(page, fixture.resetArtistEmail);
    await setNewPassword(page, NEW_PASSWORD, NEW_PASSWORD);
    await expect(page).toHaveURL(`http://localhost:3000/artist/${fixture.resetArtistId}`);

    // Opening the link again is harmless; only submitting redeems it.
    await openResetLink(page, fixture.resetArtistEmail);
    await setNewPassword(page, "another-new-password-789", "another-new-password-789");

    await expect(page.getByText(INVALID_LINK_COPY)).toBeVisible();
    await expect(page.getByRole("link", { name: "Request a new link" })).toHaveAttribute(
      "href",
      "/artist/forgot-password"
    );
  });
});

test.describe("artist password reset privacy and validation", () => {
  // No artist Account, and a CLIENT account (which holds no password): both get
  // the same screen an artist does, and neither is sent a link.
  for (const variant of ["no account", "client account"] as const) {
    test(`an ineligible address (${variant}) sees the same screen and is sent nothing`, async ({
      page,
    }) => {
      const fixture = await readFixture();
      const email =
        variant === "no account" ? "e2e-reset-no-account@example.com" : fixture.clientLoginEmail;

      await page.goto("/artist/forgot-password");
      await requestResetLink(page, email);

      const sent = await readCapturedEmails();
      expect(sent.filter((record) => record.to === email && "resetLink" in record)).toEqual([]);
    });
  }

  test("a mismatched confirmation shows a field error and stays on the form", async ({
    page,
  }) => {
    await page.goto(`/artist/reset-password?token=${WELL_FORMED_UNISSUED_TOKEN}`);
    await setNewPassword(page, "a-long-enough-password", "a-different-long-password");

    await expect(page.getByText("Passwords do not match.")).toBeVisible();
    await expect(page).toHaveURL(/\/artist\/reset-password\?token=/);
    await expect(page.getByText(INVALID_LINK_COPY)).toHaveCount(0);
  });

  test("a reset page with no token shows the invalid state", async ({ page }) => {
    await page.goto("/artist/reset-password");

    await expect(page.getByText(INVALID_LINK_COPY)).toBeVisible();
    await expect(page.getByRole("link", { name: "Request a new link" })).toBeVisible();
  });

  test("the forgot-password form's structure", async ({ page }) => {
    await page.goto("/artist/forgot-password");
    await page.waitForLoadState("networkidle");

    await expect(page.getByRole("main")).toMatchAriaSnapshot(`
      - link "Back":
        - /url: /artist/login
      - heading "Reset your password" [level=1]
      - paragraph: Enter the email on your artist account and we'll send you a link to reset your password.
      - group:
        - text: Email
        - textbox "Email"
      - button "Send reset link"
    `);
  });

  test("the reset-password form's structure", async ({ page }) => {
    await page.goto(`/artist/reset-password?token=${WELL_FORMED_UNISSUED_TOKEN}`);
    await page.waitForLoadState("networkidle");

    await expect(page.getByRole("main")).toMatchAriaSnapshot(`
      - link "Back":
        - /url: /artist/login
      - heading "Choose a new password" [level=1]
      - group:
        - text: New password
        - textbox "New password"
        - paragraph: At least 12 characters.
      - group:
        - text: Confirm new password
        - textbox "Confirm new password"
      - button "Set new password"
    `);
  });
});
