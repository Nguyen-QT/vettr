import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { isAuthorizedCronRequest } from "./cronAuth";

const SECRET = "test-cron-secret";

function buildRequest(authorization?: string): Request {
  return new Request("http://localhost/api/cron/test", {
    method: "POST",
    headers: authorization === undefined ? {} : { authorization },
  });
}

describe("isAuthorizedCronRequest", () => {
  beforeEach(() => {
    vi.stubEnv("CRON_SECRET", SECRET);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("accepts the bearer token that matches CRON_SECRET", () => {
    expect(isAuthorizedCronRequest(buildRequest(`Bearer ${SECRET}`))).toBe(true);
  });

  it("rejects when CRON_SECRET is empty, even for an empty bearer token", () => {
    vi.stubEnv("CRON_SECRET", "");

    expect(isAuthorizedCronRequest(buildRequest("Bearer "))).toBe(false);
  });

  it("rejects when CRON_SECRET is unset", () => {
    vi.stubEnv("CRON_SECRET", undefined);

    expect(isAuthorizedCronRequest(buildRequest("Bearer "))).toBe(false);
    expect(isAuthorizedCronRequest(buildRequest("Bearer undefined"))).toBe(false);
  });

  it("rejects when the Authorization header is missing", () => {
    expect(isAuthorizedCronRequest(buildRequest())).toBe(false);
  });

  it("rejects a non-Bearer scheme carrying the secret", () => {
    expect(isAuthorizedCronRequest(buildRequest(`Basic ${SECRET}`))).toBe(false);
  });

  it("rejects a wrong token of the same length", () => {
    const wrong = "x".repeat(SECRET.length);

    expect(isAuthorizedCronRequest(buildRequest(`Bearer ${wrong}`))).toBe(false);
  });

  it.each([["short"], [`${SECRET}-and-more`]])(
    "rejects (without throwing) the wrong-length token %j",
    (token) => {
      expect(isAuthorizedCronRequest(buildRequest(`Bearer ${token}`))).toBe(false);
    },
  );

  it("reads CRON_SECRET per call, so a rotated secret applies immediately", () => {
    const rotated = "rotated-cron-secret";
    vi.stubEnv("CRON_SECRET", rotated);

    expect(isAuthorizedCronRequest(buildRequest(`Bearer ${SECRET}`))).toBe(false);
    expect(isAuthorizedCronRequest(buildRequest(`Bearer ${rotated}`))).toBe(true);
  });
});
