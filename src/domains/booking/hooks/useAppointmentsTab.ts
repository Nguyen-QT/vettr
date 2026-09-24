"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

export type AppointmentsTab = "upcoming" | "needs-resolution";

const TAB_PARAM = "tab";
const DEFAULT_TAB: AppointmentsTab = "upcoming";

function isAppointmentsTab(value: string | null): value is AppointmentsTab {
  return value === "upcoming" || value === "needs-resolution";
}

// Data orchestration (CLAUDE.md 21.1.2): syncs the active Upcoming/Needs
// Resolution tab to a `?tab=` URL search param so the selection survives
// back/forward navigation and is linkable/shareable. Pure state
// orchestration over the URL -- no Domain Service/Controller-Action layer,
// since no new reads or writes are introduced.
export function useAppointmentsTab() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const tabParam = searchParams.get(TAB_PARAM);
  const activeTab: AppointmentsTab = isAppointmentsTab(tabParam)
    ? tabParam
    : DEFAULT_TAB;

  function setActiveTab(tab: AppointmentsTab) {
    if (tab === activeTab) {
      return;
    }
    const params = new URLSearchParams(searchParams.toString());
    if (tab === DEFAULT_TAB) {
      params.delete(TAB_PARAM);
    } else {
      params.set(TAB_PARAM, tab);
    }
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname, {
      scroll: false,
    });
  }

  return { activeTab, setActiveTab };
}
