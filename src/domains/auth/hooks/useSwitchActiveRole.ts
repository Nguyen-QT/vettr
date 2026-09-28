"use client"

import { useState, useTransition } from "react";
import { switchActiveRoleAction } from "@/domains/auth/actions";
import type { RoleSwitcherProps } from "@/domains/auth/types";

export function useSwitchActiveRole() {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | undefined>(undefined);

  function onSwitch(targetRole: Parameters<RoleSwitcherProps["onSwitch"]>[0]) {
    setError(undefined);
    startTransition(async () => {
      const result = await switchActiveRoleAction({ targetRole });
      if (result && !result.success) {
        setError(result.error);
      }
    });
  }

  return { isPending, error, onSwitch };
}