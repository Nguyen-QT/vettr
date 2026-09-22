import { expect, test } from "@playwright/test";

test.describe("theme toggle", () => {
  test("defaults to dark mode with no stored preference", async ({ page }) => {
    await page.goto("/");

    await expect(page.locator("html")).toHaveClass(/dark/);
  });

  test("switches to light mode and persists across a reload", async ({ page }) => {
    await page.goto("/");

    await page.getByRole("button", { name: "Toggle theme" }).click();
    await expect(page.locator("html")).not.toHaveClass(/dark/);

    await page.reload();
    // The anti-flash inline script applies the stored preference before
    // hydration, so the class is already correct on this fresh load --
    // no visible flash of dark mode to wait out.
    await expect(page.locator("html")).not.toHaveClass(/dark/);
  });

  test("switching back to dark restores the dark class", async ({ page }) => {
    await page.goto("/");

    const toggle = page.getByRole("button", { name: "Toggle theme" });
    await toggle.click();
    await expect(page.locator("html")).not.toHaveClass(/dark/);

    await toggle.click();
    await expect(page.locator("html")).toHaveClass(/dark/);
  });
});
