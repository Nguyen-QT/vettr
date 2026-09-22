// Shared between the root layout's anti-flash inline script (server
// component) and ThemeToggle (client component) -- kept in a plain
// module rather than exported from ThemeToggle.tsx so importing it
// doesn't drag a "use client" boundary into the layout.
export const THEME_STORAGE_KEY = "vettr-theme";
