// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { THEME_STORAGE_KEY } from "@/lib/theme";

import { ThemePicker } from "./ThemePicker";

function getRadio(name: "Light" | "Dark"): HTMLElement {
  return screen.getByRole("radio", { name });
}

describe("ThemePicker", () => {
  beforeEach(() => {
    document.documentElement.className = "dark";
    window.localStorage.clear();
  });

  afterEach(() => {
    cleanup();
  });

  it("names the group Theme with Light and Dark radios", () => {
    render(<ThemePicker />);

    const group = screen.getByRole("radiogroup", { name: "Theme" });
    expect(within(group).getByRole("radio", { name: "Light" })).toBeTruthy();
    expect(within(group).getByRole("radio", { name: "Dark" })).toBeTruthy();
  });

  it("checks Dark while the dark class is set", () => {
    render(<ThemePicker />);

    expect(getRadio("Dark").getAttribute("aria-checked")).toBe("true");
    expect(getRadio("Light").getAttribute("aria-checked")).toBe("false");
  });

  it("checks Light without the dark class", () => {
    document.documentElement.className = "";

    render(<ThemePicker />);

    expect(getRadio("Light").getAttribute("aria-checked")).toBe("true");
    expect(getRadio("Dark").getAttribute("aria-checked")).toBe("false");
  });

  it("applies and stores light when Light is clicked", async () => {
    render(<ThemePicker />);

    fireEvent.click(getRadio("Light"));

    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
    await waitFor(() => {
      expect(getRadio("Light").getAttribute("aria-checked")).toBe("true");
    });
  });

  it("follows a class change made outside the picker", async () => {
    render(<ThemePicker />);

    document.documentElement.classList.remove("dark");

    await waitFor(() => {
      expect(getRadio("Light").getAttribute("aria-checked")).toBe("true");
    });
  });

  it("renders disabled with nothing checked on the server, before the class is known", () => {
    const container = document.createElement("div");
    container.innerHTML = renderToString(<ThemePicker />);

    // No names here: base-ui links each radio to its label in a layout
    // effect, which the server render doesn't run.
    const serverRadios = within(container).getAllByRole("radio");
    expect(serverRadios).toHaveLength(2);
    for (const radio of serverRadios) {
      expect(radio.hasAttribute("data-disabled")).toBe(true);
      expect(radio.getAttribute("aria-checked")).toBe("false");
    }
  });
});
