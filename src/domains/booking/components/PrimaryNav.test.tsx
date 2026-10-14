// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { PrimaryNav } from "./PrimaryNav";
import type { PrimaryNavProps } from "../types";

const ARTIST_ID = "artist-1";

function renderNav(props: Partial<PrimaryNavProps> = {}): HTMLElement {
  render(
    <PrimaryNav
      artistId={ARTIST_ID}
      pendingRequestCount={0}
      pastDueAppointmentCount={0}
      {...props}
    />
  );
  return screen.getByRole("navigation", { name: "Primary" });
}

describe("PrimaryNav", () => {
  afterEach(() => {
    cleanup();
  });

  it("links the four daily-operations routes for the artist", () => {
    const nav = renderNav();

    const hrefs = within(nav)
      .getAllByRole("link")
      .map((link) => link.getAttribute("href"));
    expect(hrefs).toEqual([
      `/artist/${ARTIST_ID}`,
      `/artist/${ARTIST_ID}/requests`,
      `/artist/${ARTIST_ID}/appointments`,
      `/artist/${ARTIST_ID}/calendar`,
    ]);
  });

  it("shows a count badge on Requests and Appointments when non-zero", () => {
    const nav = renderNav({ pendingRequestCount: 3, pastDueAppointmentCount: 12 });

    const requests = within(nav).getByRole("link", { name: /^Requests/ });
    expect(within(requests).getByText("3")).not.toBeNull();

    const appointments = within(nav).getByRole("link", { name: /^Appointments/ });
    expect(within(appointments).getByText("12")).not.toBeNull();
  });

  it("hides the badge when a count is zero", () => {
    const nav = renderNav({ pendingRequestCount: 0, pastDueAppointmentCount: 0 });

    expect(within(nav).getByRole("link", { name: /^Requests/ }).textContent).toBe(
      "Requests"
    );
    expect(
      within(nav).getByRole("link", { name: /^Appointments/ }).textContent
    ).toBe("Appointments");
  });

  it("leaves account actions to UserMenu", () => {
    const nav = renderNav();

    expect(within(nav).queryByRole("link", { name: "Settings" })).toBeNull();
    expect(within(nav).queryByRole("button")).toBeNull();
  });
});
