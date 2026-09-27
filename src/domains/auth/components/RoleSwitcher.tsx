"use client";

import { Button } from "@/components/ui/button";
import { RoleSwitcherProps } from "../types";

// Pure view (CLAUDE.md 26.1.4.2): renders whatever activeRole/isVisible/
// isPending it's given via props and makes no decisions of its own beyond
// display formatting (label text, target-role inversion). Whether both
// roles are actually linked (isVisible) and the switchActiveRoleAction call
// itself are wired in by the future useSwitchActiveRole hook (26.1.5.2).
export function RoleSwitcher({
  activeRole,
  isVisible,
  onSwitch,
  isPending = false,
}: RoleSwitcherProps) {
  if (!isVisible) {
    return null;
  }

  const targetRole = activeRole === "ARTIST" ? "CLIENT" : "ARTIST";
  const label =
    targetRole === "CLIENT" ? "Switch to client view" : "Switch to artist view";

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => onSwitch(targetRole)}
      disabled={isPending}
    >
      {isPending ? "Switching..." : label}
    </Button>
  );
}
