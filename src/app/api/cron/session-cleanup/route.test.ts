import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { pruneExpiredSessions } from "@/domains/auth/services/pruneExpiredSessions";

import { POST } from "./route";

vi.mock("@/domains/auth/services/pruneExpiredSessions", () => ({
  pruneExpiredSessions: vi.fn(),
}));

const SECRET = "test-cron-secret";

function buildRequest(authorization?: string): NextRequest {
  return new NextRequest("http://localhost/api/cron/session-cleanup", {
    method: "POST",
    headers: authorization === undefined ? {} : { authorization },
  });
}

describe("POST /api/cron/session-cleanup", () => {
  beforeEach(() => {
    vi.stubEnv("CRON_SECRET", SECRET);
    vi.mocked(pruneExpiredSessions).mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("returns 401 when CRON_SECRET is unset, even for an empty bearer token", async () => {
    vi.stubEnv("CRON_SECRET", "");

    const response = await POST(buildRequest("Bearer "));

    expect(response.status).toBe(401);
    expect(pruneExpiredSessions).not.toHaveBeenCalled();
  });

  it("returns 401 when the Authorization header is missing", async () => {
    const response = await POST(buildRequest());

    expect(response.status).toBe(401);
    expect(pruneExpiredSessions).not.toHaveBeenCalled();
  });

  it("returns 401 for a non-Bearer scheme", async () => {
    const response = await POST(buildRequest(`Basic ${SECRET}`));

    expect(response.status).toBe(401);
    expect(pruneExpiredSessions).not.toHaveBeenCalled();
  });

  it("returns 401 for a wrong token of the same length", async () => {
    const wrong = "x".repeat(SECRET.length);

    const response = await POST(buildRequest(`Bearer ${wrong}`));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized." });
    expect(pruneExpiredSessions).not.toHaveBeenCalled();
  });

  it("returns 401 (without throwing) for a wrong token of a different length", async () => {
    const response = await POST(buildRequest("Bearer short"));

    expect(response.status).toBe(401);
    expect(pruneExpiredSessions).not.toHaveBeenCalled();
  });

  it("returns 200 with deletedCount and durationMs on success", async () => {
    vi.mocked(pruneExpiredSessions).mockResolvedValue(42);

    const response = await POST(buildRequest(`Bearer ${SECRET}`));
    const body = (await response.json()) as { deletedCount: number; durationMs: number };

    expect(response.status).toBe(200);
    expect(body.deletedCount).toBe(42);
    expect(typeof body.durationMs).toBe("number");
    expect(body.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("returns a generic 500 and logs when the service throws", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.mocked(pruneExpiredSessions).mockRejectedValue(new Error("P2024 connection pool timeout"));

    const response = await POST(buildRequest(`Bearer ${SECRET}`));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({ error: "Session cleanup failed." });
    expect(JSON.stringify(body)).not.toContain("P2024");
    expect(consoleError).toHaveBeenCalled();
  });
});
