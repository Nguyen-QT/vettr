"use client";

import { cn } from "cn";
import { useId, useSyncExternalStore } from "react";

import {
  Field,
  FieldDescription,
  FieldLabel,
  FieldLegend,
  FieldSet,
  FieldTitle,
} from "@/components/ui/field";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  applyTheme,
  isDarkThemeActive,
  isTheme,
  subscribeToThemeClass,
  type Theme,
} from "@/lib/theme";

const THEME_OPTIONS: ReadonlyArray<{ value: Theme; label: string }> = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

function getThemeSnapshot(): Theme {
  return isDarkThemeActive() ? "dark" : "light";
}

// The server can't see the class the init script will set, so null
// means "not yet known": the group renders disabled with nothing
// selected until hydration rather than guessing a choice that might
// not match.
function getThemeServerSnapshot(): null {
  return null;
}

// A phone sketched in token shapes. The theme class on the screen
// re-scopes the tokens (globals.css), so each preview shows that
// theme's real colours whatever the page's theme is. Plain token
// classes only: `dark:` variants follow <html>, not this scope.
function ThemePreview({ theme }: { theme: Theme }) {
  return (
    <div aria-hidden="true" className="flex justify-center">
      <div className="w-20 rounded-lg bg-muted-foreground/20 p-1">
        <div
          className={cn(
            theme,
            "flex aspect-[9/19] flex-col gap-1.5 rounded-md bg-background p-1.5"
          )}
        >
          <div className="h-2 rounded-sm bg-muted" />
          <div className="h-6 rounded-sm border bg-card" />
          <div className="h-6 rounded-sm border bg-card" />
          <div className="mt-auto h-2.5 rounded-sm bg-primary" />
        </div>
      </div>
    </div>
  );
}

// Cross-cutting UI component (CLAUDE.md repository blueprint) -- pure
// theme mechanics, no domain logic, so it lives outside src/domains/.
export function ThemePicker() {
  const id = useId();
  const legendId = useId();
  const descriptionId = useId();
  const theme = useSyncExternalStore(
    subscribeToThemeClass,
    getThemeSnapshot,
    getThemeServerSnapshot
  );

  return (
    <FieldSet>
      <FieldLegend id={legendId}>Theme</FieldLegend>
      <FieldDescription id={descriptionId}>Saved on this device.</FieldDescription>
      <RadioGroup
        className="grid-cols-2 gap-4"
        aria-labelledby={legendId}
        aria-describedby={descriptionId}
        value={theme}
        disabled={theme === null}
        onValueChange={(value: unknown) => {
          if (isTheme(value)) {
            applyTheme(value);
          }
        }}
      >
        {THEME_OPTIONS.map((option) => (
          <FieldLabel key={option.value} htmlFor={`${id}-${option.value}`}>
            <Field>
              <ThemePreview theme={option.value} />
              <div className="flex items-center gap-2">
                <RadioGroupItem value={option.value} id={`${id}-${option.value}`} />
                <FieldTitle>{option.label}</FieldTitle>
              </div>
            </Field>
          </FieldLabel>
        ))}
      </RadioGroup>
    </FieldSet>
  );
}
