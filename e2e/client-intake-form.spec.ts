import { readFile } from "node:fs/promises";
import path from "node:path";

import { expect, test } from "@playwright/test";

import type { E2eFixture } from "./global-setup";

const FIXTURE_PATH = path.join(__dirname, ".fixture.json");

async function readFixture(): Promise<E2eFixture> {
  const raw = await readFile(FIXTURE_PATH, "utf-8");
  return JSON.parse(raw);
}

// Scoped to what 4.1e actually changed: the new preferred date/time
// fields. A full successful-submission test would also need to drive
// UploadThing's real upload flow, which is out of scope here.
test.describe("client intake form -- requested slot", () => {
  test("shows the preferred date and fixed daily time options", async ({
    page,
  }) => {
    const fixture = await readFixture();

    await page.goto(`/book/${fixture.artistId}`);
    await page.waitForLoadState("networkidle");

    await expect(page.getByLabel("Preferred date")).toBeVisible();
    await expect(page.getByText("11:00")).toBeVisible();
    await expect(page.getByText("14:00")).toBeVisible();
    await expect(page.getByText("17:30")).toBeVisible();
  });

  test("rejects a preferred date/time in the past on submit", async ({
    page,
  }) => {
    const fixture = await readFixture();

    await page.goto(`/book/${fixture.artistId}`);
    // Wait for hydration before the first interaction -- filling an input
    // before Next.js attaches its event handlers silently drops the fill.
    await page.waitForLoadState("networkidle");

    await page.getByLabel("Preferred date").fill("2020-01-01");
    await page.getByRole("button", { name: "Submit request" }).click();

    await expect(
      page.getByText("Choose a date and time in the future.")
    ).toBeVisible();
  });
});
