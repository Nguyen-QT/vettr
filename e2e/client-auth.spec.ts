import { readFile } from "node:fs/promises";
import path from "node:path";

import { expect, test } from "@playwright/test";

import type { E2eFixture } from "./global-setup";

const FIXTURE_PATH = path.join(__dirname, ".fixture.json");

async function readFixture(): Promise<E2eFixture> {
  const raw = await readFile(FIXTURE_PATH, "utf-8");
  return JSON.parse(raw);
}

test.describe("client signup, login, and dashboard", () => {
  test("logs in with correct credentials and shows the client's booking", async ({
    page,
  }) => {
    const fixture = await readFixture();

    await page.goto("/client/login");
    await page.getByLabel("Email").fill(fixture.clientLoginEmail);
    await page.getByLabel("Password").fill(fixture.clientLoginPassword);
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page).toHaveURL("http://localhost:3000/client");
    await expect(page.getByText("E2E Fixture Artist")).toBeVisible();
  });

  test("rejects an incorrect password", async ({ page }) => {
    const fixture = await readFixture();

    await page.goto("/client/login");
    await page.getByLabel("Email").fill(fixture.clientLoginEmail);
    await page.getByLabel("Password").fill("wrong-password");
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page.getByText("Incorrect email or password.")).toBeVisible();
    await expect(page).toHaveURL(/\/client\/login/);
  });

  test("signs up with an email that has a prior booking and reaches the dashboard", async ({
    page,
  }) => {
    const fixture = await readFixture();

    await page.goto("/client/signup");
    await page.getByLabel("Email").fill(fixture.clientSignupEmail);
    await page.getByLabel("Password").fill("a-brand-new-password");
    await page.getByRole("button", { name: "Create account" }).click();

    await expect(page).toHaveURL("http://localhost:3000/client");
  });

  test("rejects signup for an email with no prior booking", async ({ page }) => {
    await page.goto("/client/signup");
    await page.getByLabel("Email").fill("no-such-booking@example.com");
    await page.getByLabel("Password").fill("a-brand-new-password");
    await page.getByRole("button", { name: "Create account" }).click();

    await expect(
      page.getByText("We couldn't find a booking under that email.", {
        exact: false,
      })
    ).toBeVisible();
    await expect(page).toHaveURL(/\/client\/signup/);
  });

  test("logging out clears the session and blocks the dashboard again", async ({
    page,
  }) => {
    const fixture = await readFixture();

    await page.goto("/client/login");
    await page.getByLabel("Email").fill(fixture.clientLoginEmail);
    await page.getByLabel("Password").fill(fixture.clientLoginPassword);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL("http://localhost:3000/client");

    await page.getByRole("button", { name: "Log out" }).click();
    await expect(page).toHaveURL(/\/client\/login/);

    await page.goto("/client");
    await expect(page).toHaveURL(/\/client\/login/);
  });
});
