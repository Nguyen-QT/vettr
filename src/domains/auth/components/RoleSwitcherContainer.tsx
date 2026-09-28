"use client";

import { RoleSwitcher } from "@/domains/auth/components/RoleSwitcher";
import { useSwitchActiveRole } from "@/domains/auth/hooks/useSwitchActiveRole";

interface RoleSwitcherContainerProps {
  activeRole: "ARTIST" | "CLIENT";
  isVisible: boolean;
}

// Data orchestration wrapper (CLAUDE.md 26.1.6.2): the layouts that render
// this only know the session-derived activeRole/isVisible -- switching
// itself (and its pending/error state) is this hook's job, same split as
// SetUpClientProfileSettings wrapping useSetUpClientProfile.
export function RoleSwitcherContainer({ activeRole, isVisible }: RoleSwitcherContainerProps) {
  const { onSwitch, isPending } = useSwitchActiveRole();
  return (
    <RoleSwitcher
      activeRole={activeRole}
      isVisible={isVisible}
      onSwitch={onSwitch}
      isPending={isPending}
    />
  );
}
