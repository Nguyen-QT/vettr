"use client";

import { SetUpClientProfileForm } from "@/domains/auth/components/SetUpClientProfileForm";
import { useSetUpClientProfile } from "@/domains/auth/hooks/useSetUpClientProfile";

export function SetUpClientProfileSettings() {
  const { isSuccess, ...formProps } = useSetUpClientProfile();
  if (isSuccess) {
    return <p role="status">You&apos;re all set — your client profile is linked.</p>;
  }
  return <SetUpClientProfileForm {...formProps} />;
}