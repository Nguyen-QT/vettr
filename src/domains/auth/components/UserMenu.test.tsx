// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { UserMenu } from "./UserMenu";
import type { UserMenuProps } from "../types";

const switchActiveRoleActionMock = vi.fn();

vi.mock("@/domains/auth/actions", () => ({
  logoutAction: vi.fn(),
  switchActiveRoleAction: (...args: unknown[]) => switchActiveRoleActionMock(...args),
}));

const SETTINGS_HREF = "/artist/artist-1/settings/hours";

async function openMenu(props: Partial<UserMenuProps> = {}): Promise<void> {
  render(
    <UserMenu
      activeRole="ARTIST"
      isDualRole={false}
      settingsHref={SETTINGS_HREF}
      {...props}
    />
  );
  fireEvent.click(screen.getByRole("button", { name: "Account menu" }));
  await screen.findByRole("menu");
}

describe("UserMenu", () => {
  beforeEach(() => {
    switchActiveRoleActionMock.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it("links the Settings item to settingsHref", async () => {
    await openMenu();

    const settings = screen.getByRole("menuitem", { name: "Settings" });
    expect(settings.getAttribute("href")).toBe(SETTINGS_HREF);
  });

  it("hides the role switch for a single-role session", async () => {
    await openMenu({ isDualRole: false });

    expect(screen.queryByRole("menuitem", { name: /Switch to/ })).toBeNull();
  });

  it("switches a dual-role artist session to the client view", async () => {
    switchActiveRoleActionMock.mockResolvedValue(undefined);
    await openMenu({ isDualRole: true, activeRole: "ARTIST" });

    fireEvent.click(screen.getByRole("menuitem", { name: "Switch to client view" }));

    await waitFor(() => {
      expect(switchActiveRoleActionMock).toHaveBeenCalledWith({ targetRole: "CLIENT" });
    });
  });

  it("offers the artist view to a dual-role client session", async () => {
    await openMenu({ isDualRole: true, activeRole: "CLIENT" });

    expect(
      screen.getByRole("menuitem", { name: "Switch to artist view" })
    ).not.toBeNull();
  });

  it("renders Log out as a submit button inside the logout form", async () => {
    await openMenu();

    const logout = screen.getByRole("menuitem", { name: "Log out" });
    expect(logout).toBeInstanceOf(HTMLButtonElement);
    expect((logout as HTMLButtonElement).type).toBe("submit");
    expect((logout as HTMLButtonElement).form).not.toBeNull();
  });
});
