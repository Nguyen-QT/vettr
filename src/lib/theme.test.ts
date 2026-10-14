// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { applyTheme, isTheme, THEME_STORAGE_KEY } from "./theme";

describe("isTheme", () => {
  it.each(["light", "dark"])("accepts %s", (value) => {
    expect(isTheme(value)).toBe(true);
  });

  it.each(["Dark", "system", "", null, undefined, 1])("rejects %s", (value) => {
    expect(isTheme(value)).toBe(false);
  });
});

describe("applyTheme", () => {
  beforeEach(() => {
    document.documentElement.className = "dark";
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("removes the dark class and stores light", () => {
    applyTheme("light");

    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
  });

  it("adds the dark class and stores dark", () => {
    document.documentElement.className = "";

    applyTheme("dark");

    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
  });

  it("still changes the theme when storage throws", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Quota exceeded", "QuotaExceededError");
    });

    expect(() => applyTheme("light")).not.toThrow();
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });
});
