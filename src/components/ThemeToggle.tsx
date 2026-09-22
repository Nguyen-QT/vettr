"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { THEME_STORAGE_KEY } from "@/lib/theme";

// Cross-cutting UI component (CLAUDE.md repository blueprint) -- pure
// theme mechanics, no domain logic, so it lives outside src/domains/.
function applyTheme(theme: "light" | "dark") {
  document.documentElement.classList.toggle("dark", theme === "dark");
  window.localStorage.setItem(THEME_STORAGE_KEY, theme);
}

export function ThemeToggle() {
  // Starts null and reads the DOM on mount rather than assuming a
  // default, since the anti-flash inline script in layout.tsx (not
  // this component) is what actually decides the initial class before
  // hydration -- this only needs to reflect whatever it already set.
  const [theme, setTheme] = useState<"light" | "dark" | null>(null);

  useEffect(() => {
    setTheme(document.documentElement.classList.contains("dark") ? "dark" : "light");
  }, []);

  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    applyTheme(next);
    setTheme(next);
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label="Toggle theme"
      onClick={toggle}
      disabled={theme === null}
    >
      {theme === "dark" ? <Sun /> : <Moon />}
    </Button>
  );
}
