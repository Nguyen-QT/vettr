import { readFile } from "node:fs/promises";
import path from "node:path";

import { expect, test } from "@playwright/test";

import type { E2eFixture } from "./global-setup";

const FIXTURE_PATH = path.join(__dirname, ".fixture.json");

async function readFixture(): Promise<E2eFixture> {
  const raw = await readFile(FIXTURE_PATH, "utf-8");
  return JSON.parse(raw);
}

test.describe("artist login and route protection", () => {
  test("redirects an unauthenticated visit to the dashboard to login", async ({
    page,
  }) => {
    const fixture = await readFixture();

    await page.goto(`/artist/${fixture.artistId}`);

    await expect(page).toHaveURL(/\/artist\/login/);
  });

  test("logs in with correct credentials and reaches the dashboard", async ({
    page,
  }) => {
    const fixture = await readFixture();

    await page.goto(`/artist/${fixture.artistId}`);
    await expect(page).toHaveURL(/\/artist\/login/);

    await page.getByLabel("Email").fill(fixture.artistLoginEmail);
    await page.getByLabel("Password").fill(fixture.artistLoginPassword);
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page).toHaveURL(`http://localhost:3000/artist/${fixture.artistId}`);
  });

  test("rejects an incorrect password", async ({ page }) => {
    const fixture = await readFixture();

    await page.goto("/artist/login");
    await page.getByLabel("Email").fill(fixture.artistLoginEmail);
    await page.getByLabel("Password").fill("wrong-password");
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page.getByText("Incorrect email or password.")).toBeVisible();
    await expect(page).toHaveURL(/\/artist\/login/);
  });

  test("logging out clears the session and blocks the dashboard again", async ({
    page,
  }) => {
    const fixture = await readFixture();

    await page.goto("/artist/login");
    await page.getByLabel("Email").fill(fixture.artistLoginEmail);
    await page.getByLabel("Password").fill(fixture.artistLoginPassword);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(`http://localhost:3000/artist/${fixture.artistId}`);

    await page.getByRole("button", { name: "Log out" }).click();
    await expect(page).toHaveURL(/\/artist\/login/);

    await page.goto(`/artist/${fixture.artistId}`);
    await expect(page).toHaveURL(/\/artist\/login/);
  });
});
