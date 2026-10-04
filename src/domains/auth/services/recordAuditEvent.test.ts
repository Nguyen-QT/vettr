import { afterEach, describe, expect, it, vi } from "vitest";

import { prismaMock } from "@/testUtils/prismaMock";

import { recordAuditEvent } from "./recordAuditEvent";

describe("recordAuditEvent", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("creates an audit row and resolves void", async () => {
    prismaMock.auditEvent.create.mockResolvedValue({} as never);

    const result = await recordAuditEvent({
      eventType: "ROLE_SWITCH",
      outcome: "SUCCESS",
      reasonCode: "ROLE_SWITCHED",
      accountId: "acc_1",
      targetRole: "CLIENT",
    });

    expect(result).toBeUndefined();
    expect(prismaMock.auditEvent.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.auditEvent.create).toHaveBeenCalledWith({
      data: {
        eventType: "ROLE_SWITCH",
        outcome: "SUCCESS",
        reasonCode: "ROLE_SWITCHED",
        accountId: "acc_1",
        attemptedEmail: null,
        targetRole: "CLIENT",
      },
    });
  });

  it("stores attemptedEmail with a null accountId for unknown-account logins", async () => {
    prismaMock.auditEvent.create.mockResolvedValue({} as never);

    await recordAuditEvent({
      eventType: "LOGIN_FAILED",
      outcome: "REJECTED",
      reasonCode: "ACCOUNT_NOT_FOUND",
      attemptedEmail: "nobody@example.com",
    });

    expect(prismaMock.auditEvent.create).toHaveBeenCalledWith({
      data: {
        eventType: "LOGIN_FAILED",
        outcome: "REJECTED",
        reasonCode: "ACCOUNT_NOT_FOUND",
        accountId: null,
        attemptedEmail: "nobody@example.com",
        targetRole: null,
      },
    });
  });

  it("swallows a create failure and logs a single console.error", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    prismaMock.auditEvent.create.mockRejectedValue(new Error("db down"));

    await expect(
      recordAuditEvent({
        eventType: "LOGIN_FAILED",
        outcome: "REJECTED",
        reasonCode: "INVALID_PASSWORD",
        accountId: "acc_1",
      }),
    ).resolves.toBeUndefined();

    expect(errorSpy).toHaveBeenCalledTimes(1);
    const logged = JSON.stringify(errorSpy.mock.calls[0]);
    expect(logged).toContain("LOGIN_FAILED");
    expect(logged).toContain("INVALID_PASSWORD");
    expect(logged).toContain("acc_1");
  });

  it("never logs attemptedEmail, even when the error message echoes it", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    prismaMock.auditEvent.create.mockRejectedValue(
      new Error("Invalid data: attemptedEmail=nobody@example.com"),
    );

    await recordAuditEvent({
      eventType: "LOGIN_FAILED",
      outcome: "REJECTED",
      reasonCode: "ACCOUNT_NOT_FOUND",
      attemptedEmail: "nobody@example.com",
    });

    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(errorSpy.mock.calls[0])).not.toContain("nobody@example.com");
  });
});
