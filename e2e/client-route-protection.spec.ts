import { expect, test } from "@playwright/test";

// Full authenticated-flow coverage (signup/login/logout via the actual
// UI) lives in client-auth.spec.ts (5.2.4). This spec exercises the
// proxy itself (CLAUDE.md 5.2.3) via raw requests rather than page
// navigation, since it predates the /client pages existing.
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

    // A 200 (not a redirect) confirms the proxy let the request
    // through to the real login page (5.2.4).
    expect(response.status()).toBe(200);
  });
});
