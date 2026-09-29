import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sendMock = vi.fn();

vi.mock("@/lib/resend", () => ({
  resend: {
    emails: {
      send: (...args: unknown[]) => sendMock(...args),
    },
  },
}));

const captureEmailMock = vi.fn();

vi.mock("@/lib/emailCaptureSink", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/emailCaptureSink")>();
  return {
    ...actual,
    captureEmail: (...args: Parameters<typeof actual.captureEmail>) => captureEmailMock(...args),
  };
});

// Imported after the mocks so the module under test picks them up.
const { sendVerificationEmail } = await import("./sendVerificationEmail");

describe("sendVerificationEmail", () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    sendMock.mockReset();
    captureEmailMock.mockReset();
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubEnv("EMAIL_FROM", "Vettr <noreply@example.com>");
    vi.stubEnv("EMAIL_CAPTURE_SINK_PATH", "");
    vi.stubEnv("NODE_ENV", "test");
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    vi.unstubAllEnvs();
  });

  it("sends the code via Resend and returns success", async () => {
    sendMock.mockResolvedValue({ data: { id: "email_1" }, error: null });

    const result = await sendVerificationEmail("client@example.com", "123456");

    expect(result).toEqual({ success: true });
    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "Vettr <noreply@example.com>",
        to: "client@example.com",
        text: expect.stringContaining("123456"),
      })
    );
  });

  it("reports failure when Resend returns an error response, without logging its message", async () => {
    sendMock.mockResolvedValue({
      data: null,
      error: {
        message: "Invalid `to` field: client@example.com is not a verified recipient",
        statusCode: 422,
        name: "validation_error",
      },
    });

    const result = await sendVerificationEmail("client@example.com", "123456");

    expect(result).toEqual({ success: false });
    for (const call of consoleErrorSpy.mock.calls) {
      const logged = JSON.stringify(call);
      expect(logged).not.toContain("client@example.com");
      expect(logged).not.toContain("123456");
      expect(logged).not.toContain("not a verified recipient");
    }
  });

  it("reports failure when the send call throws, without logging the thrown error", async () => {
    sendMock.mockRejectedValue(new Error("network error for client@example.com"));

    const result = await sendVerificationEmail("client@example.com", "123456");

    expect(result).toEqual({ success: false });
    for (const call of consoleErrorSpy.mock.calls) {
      const logged = JSON.stringify(call);
      expect(logged).not.toContain("client@example.com");
      expect(logged).not.toContain("123456");
      expect(logged).not.toContain("network error");
    }
  });

  it("reports failure and never calls Resend when EMAIL_FROM is unset", async () => {
    vi.stubEnv("EMAIL_FROM", "");

    const result = await sendVerificationEmail("client@example.com", "123456");

    expect(result).toEqual({ success: false });
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("captures to the sink instead of calling Resend when the sink is enabled", async () => {
    vi.stubEnv("EMAIL_CAPTURE_SINK_PATH", "/tmp/e2e-emails.jsonl");
    captureEmailMock.mockResolvedValue(undefined);

    const result = await sendVerificationEmail("client@example.com", "123456");

    expect(result).toEqual({ success: true });
    expect(captureEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({ to: "client@example.com", code: "123456" })
    );
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("ignores the sink and calls Resend when NODE_ENV is production", async () => {
    vi.stubEnv("EMAIL_CAPTURE_SINK_PATH", "/tmp/e2e-emails.jsonl");
    vi.stubEnv("NODE_ENV", "production");
    sendMock.mockResolvedValue({ data: { id: "email_1" }, error: null });

    const result = await sendVerificationEmail("client@example.com", "123456");

    expect(result).toEqual({ success: true });
    expect(captureEmailMock).not.toHaveBeenCalled();
    expect(sendMock).toHaveBeenCalled();
  });
});
