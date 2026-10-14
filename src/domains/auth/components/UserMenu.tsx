"use client";

import { LogOut, Settings, UserRound } from "lucide-react";
import Link from "next/link";

import { logoutAction } from "../actions";
import { UserMenuProps } from "../types";
import { RoleSwitcherContainer } from "./RoleSwitcherContainer";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// Pure view (50.1.4.2): the avatar dropdown that holds account and
// context actions -- Settings, the role switch, then Log out behind a
// divider. Everything it shows comes from session-derived props; the
// avatar is a generic icon because the session carries no name or email.
export function UserMenu({ activeRole, isDualRole, settingsHref }: UserMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Account menu"
        render={<Button variant="ghost" size="icon" className="rounded-full" />}
      >
        <Avatar>
          <AvatarFallback>
            <UserRound />
          </AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      {/* w-56 overrides the content's default anchor width (the 32px avatar). */}
      <DropdownMenuContent align="end" className="w-56">
        {/* Item rather than Base UI's LinkItem: LinkItem stays open on
            click, and this menu lives in the layout, so it would still be
            open after the client-side navigation. */}
        <DropdownMenuItem render={<Link href={settingsHref} />}>
          <Settings />
          Settings
        </DropdownMenuItem>
        <RoleSwitcherContainer
          activeRole={activeRole}
          isVisible={isDualRole}
          variant="menuItem"
        />
        <DropdownMenuSeparator />
        {/* closeOnClick={false} keeps the popup (and this form) mounted
            until the submit fires -- a detached form doesn't submit.
            logoutAction's redirect tears the menu down. */}
        <form action={logoutAction}>
          <DropdownMenuItem
            nativeButton
            render={<button type="submit" className="w-full" />}
            closeOnClick={false}
          >
            <LogOut />
            Log out
          </DropdownMenuItem>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
