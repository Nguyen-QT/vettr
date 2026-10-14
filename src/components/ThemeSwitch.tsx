"use client";

import { useId, useSyncExternalStore } from "react";

import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
} from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { applyTheme, isDarkThemeActive, subscribeToThemeClass } from "@/lib/theme";

// The server can't see the class the init script will set, so null
// means "not yet known": the switch renders disabled until hydration
// rather than guessing a state that might not match.
function getIsDarkServerSnapshot(): null {
  return null;
}

// Cross-cutting UI component (CLAUDE.md repository blueprint) -- pure
// theme mechanics, no domain logic, so it lives outside src/domains/.
export function ThemeSwitch() {
  const id = useId();
  const descriptionId = useId();
  const isDark = useSyncExternalStore(
    subscribeToThemeClass,
    isDarkThemeActive,
    getIsDarkServerSnapshot
  );

  return (
    <Field orientation="horizontal">
      <FieldContent>
        <FieldLabel htmlFor={id}>Dark mode</FieldLabel>
        <FieldDescription id={descriptionId}>Saved on this device.</FieldDescription>
      </FieldContent>
      <Switch
        id={id}
        aria-describedby={descriptionId}
        checked={isDark ?? false}
        disabled={isDark === null}
        onCheckedChange={(checked) => applyTheme(checked ? "dark" : "light")}
      />
    </Field>
  );
}
