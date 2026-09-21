import { expect, test } from "@playwright/test";

// Full authenticated-flow coverage (signup/login/logout via the actual
// UI) lands with the client login/dashboard pages in 5.2.4, mirroring
// artist-login.spec.ts. This spec only exercises the proxy itself
// (CLAUDE.md 5.2.3), via raw requests rather than page navigation,
// since no /client page exists yet for a browser to render.
test.describe("client route protection", () => {
  test("redirects an unauthenticated request to /client to the client login page", async ({
    request,
  }) => {
    const response = await request.get("/client", { maxRedirects: 0 });

    expect(response.status()).toBe(307);
    const location = response.headers()["location"];
    expect(location).toContain("/client/login");
    expect(location).toContain("redirectTo=%2Fclient");
  });

  test("leaves the public client login path unredirected", async ({ request }) => {
    const response = await request.get("/client/login", { maxRedirects: 0 });

    // No /client/login page exists yet (5.2.4) -- a 404 (not a
    // redirect) confirms the proxy let the request through.
    expect(response.status()).toBe(404);
  });
});
