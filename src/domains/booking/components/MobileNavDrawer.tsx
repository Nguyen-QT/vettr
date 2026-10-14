"use client";

import { Menu } from "lucide-react";
import { useState, type MouseEvent } from "react";

import { PrimaryNav } from "./PrimaryNav";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import type { MobileNavDrawerProps } from "@/domains/booking/types";

// Pure view (50.1.4.4): below `lg` the PrimaryNav bar hides itself and
// this ☰ trigger opens the same links in a left-hand sheet instead. Open
// state is local UI state only; everything shown comes from props.
export function MobileNavDrawer(props: MobileNavDrawerProps) {
  const [open, setOpen] = useState(false);

  // The drawer lives in the layout, which survives client-side
  // navigation, so it would still be open over the new page. Closing on
  // any link click (rather than on a pathname change) also covers a tap
  // on the route you're already on.
  function closeOnLinkClick(event: MouseEvent<HTMLDivElement>): void {
    if (event.target instanceof Element && event.target.closest("a")) {
      setOpen(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        aria-label="Open menu"
        render={<Button variant="ghost" size="icon" className="lg:hidden" />}
      >
        <Menu />
      </SheetTrigger>
      <SheetContent side="left" onClick={closeOnLinkClick}>
        <SheetHeader>
          <SheetTitle>Menu</SheetTitle>
        </SheetHeader>
        <div className="px-4">
          <PrimaryNav {...props} variant="drawer" />
        </div>
      </SheetContent>
    </Sheet>
  );
}
