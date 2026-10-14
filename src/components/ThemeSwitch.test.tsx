// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { THEME_STORAGE_KEY } from "@/lib/theme";

import { ThemeSwitch } from "./ThemeSwitch";

function getSwitch(): HTMLElement {
  return screen.getByRole("switch", { name: "Dark mode" });
}

describe("ThemeSwitch", () => {
  beforeEach(() => {
    document.documentElement.className = "dark";
    window.localStorage.clear();
  });

  afterEach(() => {
    cleanup();
  });

  it("is checked while the dark class is set", () => {
    render(<ThemeSwitch />);

    expect(getSwitch().getAttribute("aria-checked")).toBe("true");
  });

  it("is unchecked without the dark class", () => {
    document.documentElement.className = "";

    render(<ThemeSwitch />);

    expect(getSwitch().getAttribute("aria-checked")).toBe("false");
  });

  it("flips the class and the stored theme when clicked", async () => {
    render(<ThemeSwitch />);

    fireEvent.click(getSwitch());

    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
    await waitFor(() => {
      expect(getSwitch().getAttribute("aria-checked")).toBe("false");
    });
  });

  it("follows a class change made outside the switch", async () => {
    render(<ThemeSwitch />);

    document.documentElement.classList.remove("dark");

    await waitFor(() => {
      expect(getSwitch().getAttribute("aria-checked")).toBe("false");
    });
  });

  it("renders disabled on the server, before the class is known", () => {
    const container = document.createElement("div");
    container.innerHTML = renderToString(<ThemeSwitch />);

    const serverSwitch = within(container).getByRole("switch");
    expect(serverSwitch.hasAttribute("data-disabled")).toBe(true);
    expect(serverSwitch.getAttribute("aria-checked")).toBe("false");
  });
});
