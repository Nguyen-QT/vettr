import { readFile } from "node:fs/promises";
import path from "node:path";

import { expect, test } from "@playwright/test";

import type { E2eFixture } from "./global-setup";

const FIXTURE_PATH = path.join(__dirname, ".fixture.json");

async function readFixture(): Promise<E2eFixture> {
  const raw = await readFile(FIXTURE_PATH, "utf-8");
  return JSON.parse(raw);
}

test.describe("landing page and artist directory", () => {
  test("shows three paths to a signed-out visitor", async ({ page }) => {
    await page.goto("/");

    await expect(
      page.getByRole("link", { name: "I want to book an artist" })
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "I have an existing or past booking" })
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "I'm an artist" })).toBeVisible();
  });

  test("booking path leads to the directory, then the artist's booking hub", async ({
    page,
  }) => {
    const fixture = await readFixture();

    await page.goto("/");
    await page.getByRole("link", { name: "I want to book an artist" }).click();
    await expect(page).toHaveURL(/\/artists$/);

    await page.getByRole("link", { name: /E2E Fixture Artist/ }).click();
    await expect(page).toHaveURL(`http://localhost:3000/book/${fixture.artistId}`);
  });

  test("returning-client path leads to client login", async ({ page }) => {
    await page.goto("/");
    await page
      .getByRole("link", { name: "I have an existing or past booking" })
      .click();

    await expect(page).toHaveURL(/\/client\/login/);
  });

  test("artist path leads to artist login", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "I'm an artist" }).click();

    await expect(page).toHaveURL(/\/artist\/login/);
  });

  test("an already-signed-in client is redirected straight to their dashboard", async ({
    page,
  }) => {
    const fixture = await readFixture();

    await page.goto("/client/login");
    await page.getByLabel("Email").fill(fixture.clientLoginEmail);
    await page.getByLabel("Password").fill(fixture.clientLoginPassword);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL("http://localhost:3000/client");

    await page.goto("/");
    await expect(page).toHaveURL("http://localhost:3000/client");
  });

  test("an already-signed-in artist is redirected straight to their dashboard", async ({
    page,
  }) => {
    const fixture = await readFixture();

    await page.goto("/artist/login");
    await page.getByLabel("Email").fill(fixture.artistLoginEmail);
    await page.getByLabel("Password").fill(fixture.artistLoginPassword);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(`http://localhost:3000/artist/${fixture.artistId}`);

    await page.goto("/");
    await expect(page).toHaveURL(`http://localhost:3000/artist/${fixture.artistId}`);
  });
});
