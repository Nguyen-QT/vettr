import type { Page } from "@playwright/test";

import type { E2eFixture } from "./global-setup";

// Must match src/domains/auth/constants.ts's SESSION_COOKIE_NAME --
// duplicated rather than imported, same reasoning as global-setup.ts's
// raw pg usage: e2e specs run outside Next's runtime/path aliases.
const SESSION_COOKIE_NAME = "vettr_session";

// Sets the pre-seeded, already-valid session cookie from global-setup.ts
// directly (CLAUDE.md 5.1.4/5.1.5), so a spec that isn't testing login
// itself can jump straight to a protected /artist/[artistId]/* route
// instead of re-driving the login UI in every test.
export async function loginAsArtist(page: Page, fixture: E2eFixture) {
  await page.context().addCookies([
    {
      name: SESSION_COOKIE_NAME,
      value: fixture.authenticatedSessionId,
      url: "http://localhost:3000",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
}
