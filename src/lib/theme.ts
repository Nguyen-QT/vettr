// Shared between the root layout's anti-flash inline script (server
// component) and the client theme controls (ThemeToggle, ThemeSwitch)
// -- kept in a plain module rather than exported from a "use client"
// file so importing it doesn't drag that boundary into the layout.
// The layout imports only the constant; the helpers below touch
// `document` and `localStorage`, so only call them from the browser.
export const THEME_STORAGE_KEY = "vettr-theme";

export type Theme = "light" | "dark";

export function isDarkThemeActive(): boolean {
  return document.documentElement.classList.contains("dark");
}

// The class on <html> is the single source of truth (the init script
// sets it before hydration), so every ThemeSwitch on a page follows it
// through this observer rather than holding its own copy.
export function subscribeToThemeClass(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
  });
  return () => observer.disconnect();
}

export function applyTheme(theme: Theme): void {
  document.documentElement.classList.toggle("dark", theme === "dark");
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Storage blocked (e.g. private mode) or full: the theme still
    // changes for this page, it just isn't remembered on the next load.
  }
}
