// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { MobileNavDrawer } from "./MobileNavDrawer";
import type { MobileNavDrawerProps } from "../types";

const ARTIST_ID = "artist-1";

async function openDrawer(props: Partial<MobileNavDrawerProps> = {}): Promise<HTMLElement> {
  render(
    <MobileNavDrawer
      artistId={ARTIST_ID}
      pendingRequestCount={0}
      pastDueAppointmentCount={0}
      {...props}
    />
  );
  fireEvent.click(screen.getByRole("button", { name: "Open menu" }));
  return screen.findByRole("dialog", { name: "Menu" });
}

describe("MobileNavDrawer", () => {
  afterEach(() => {
    cleanup();
  });

  it("starts closed behind the menu button", () => {
    render(
      <MobileNavDrawer
        artistId={ARTIST_ID}
        pendingRequestCount={0}
        pastDueAppointmentCount={0}
      />
    );

    expect(screen.getByRole("button", { name: "Open menu" })).not.toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("opens the primary nav links with their counts", async () => {
    const drawer = await openDrawer({ pendingRequestCount: 3 });

    const nav = within(drawer).getByRole("navigation", { name: "Primary" });
    const hrefs = within(nav)
      .getAllByRole("link")
      .map((link) => link.getAttribute("href"));
    expect(hrefs).toEqual([
      `/artist/${ARTIST_ID}`,
      `/artist/${ARTIST_ID}/requests`,
      `/artist/${ARTIST_ID}/appointments`,
      `/artist/${ARTIST_ID}/calendar`,
    ]);
    const requests = within(nav).getByRole("link", { name: /^Requests/ });
    expect(within(requests).getByText("3")).not.toBeNull();
  });

  it("closes when a nav link is tapped", async () => {
    const drawer = await openDrawer();
    const requests = within(drawer).getByRole("link", { name: "Requests" });
    // jsdom can't navigate; without a router next/link leaves the click to
    // the browser default, so stop it before jsdom reports "not implemented".
    requests.addEventListener("click", (event) => event.preventDefault());

    fireEvent.click(requests);

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
  });

  it("stays open when something other than a link is tapped", async () => {
    const drawer = await openDrawer();

    fireEvent.click(within(drawer).getByText("Menu"));

    expect(screen.getByRole("dialog", { name: "Menu" })).not.toBeNull();
  });
});
