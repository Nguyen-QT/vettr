import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { retryOwedDepositRefunds } from "@/domains/billing/services/retryOwedDepositRefunds";

import { POST } from "./route";

vi.mock("@/domains/billing/services/retryOwedDepositRefunds", () => ({
  retryOwedDepositRefunds: vi.fn(),
}));

const SECRET = "test-cron-secret";

function buildRequest(authorization?: string): NextRequest {
  return new NextRequest("http://localhost/api/cron/deposit-refund-retry", {
    method: "POST",
    headers: authorization === undefined ? {} : { authorization },
  });
}

describe("POST /api/cron/deposit-refund-retry", () => {
  beforeEach(() => {
    vi.stubEnv("CRON_SECRET", SECRET);
    vi.mocked(retryOwedDepositRefunds).mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("returns 401 when CRON_SECRET is unset, even for an empty bearer token", async () => {
    vi.stubEnv("CRON_SECRET", "");

    const response = await POST(buildRequest("Bearer "));

    expect(response.status).toBe(401);
    expect(retryOwedDepositRefunds).not.toHaveBeenCalled();
  });

  it("returns 401 when the Authorization header is missing", async () => {
    const response = await POST(buildRequest());

    expect(response.status).toBe(401);
    expect(retryOwedDepositRefunds).not.toHaveBeenCalled();
  });

  it("returns 401 for a non-Bearer scheme", async () => {
    const response = await POST(buildRequest(`Basic ${SECRET}`));

    expect(response.status).toBe(401);
    expect(retryOwedDepositRefunds).not.toHaveBeenCalled();
  });

  it("returns 401 for a wrong token of the same length", async () => {
    const wrong = "x".repeat(SECRET.length);

    const response = await POST(buildRequest(`Bearer ${wrong}`));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized." });
    expect(retryOwedDepositRefunds).not.toHaveBeenCalled();
  });

  it("returns 401 (without throwing) for a wrong token of a different length", async () => {
    const response = await POST(buildRequest("Bearer short"));

    expect(response.status).toBe(401);
    expect(retryOwedDepositRefunds).not.toHaveBeenCalled();
  });

  it("returns 200 with the sweep's counts and durationMs, failed rows included", async () => {
    vi.mocked(retryOwedDepositRefunds).mockResolvedValue({
      reconciled: 1,
      refunded: 2,
      failed: 3,
      deferred: 4,
    });

    const response = await POST(buildRequest(`Bearer ${SECRET}`));
    const body = (await response.json()) as {
      reconciled: number;
      refunded: number;
      failed: number;
      deferred: number;
      durationMs: number;
    };

    expect(response.status).toBe(200);
    expect(body.reconciled).toBe(1);
    expect(body.refunded).toBe(2);
    expect(body.failed).toBe(3);
    expect(body.deferred).toBe(4);
    expect(typeof body.durationMs).toBe("number");
    expect(body.durationMs).toBeGreaterThanOrEqual(0);
    expect(retryOwedDepositRefunds).toHaveBeenCalledTimes(1);
  });

  it("returns a generic 500 without leaking the Prisma code when the sweep throws", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.mocked(retryOwedDepositRefunds).mockRejectedValue(
      new Error("P2024 connection pool timeout"),
    );

    const response = await POST(buildRequest(`Bearer ${SECRET}`));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({ error: "Deposit refund retry failed." });
    expect(JSON.stringify(body)).not.toContain("P2024");
    expect(retryOwedDepositRefunds).toHaveBeenCalledTimes(1);
    expect(consoleError).toHaveBeenCalledTimes(1);
  });
});
