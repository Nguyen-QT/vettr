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
const { sendPasswordResetEmail } = await import("./sendPasswordResetEmail");

const EMAIL = "artist@example.com";
// 43 base64url chars, the shape generatePasswordResetToken returns.
const TOKEN = "abcDEF123_-abcDEF123_-abcDEF123_-abcDEF1234";
const RESET_LINK = `https://vettr.example/artist/reset-password?token=${TOKEN}`;

describe("sendPasswordResetEmail", () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  // Every failure log must stay on the fixed allowlist: no recipient, no
  // token, no link, and none of the thrown/Resend message text.
  function expectNoSecretsLogged(...extra: string[]) {
    for (const call of consoleErrorSpy.mock.calls) {
      const logged = JSON.stringify(call);
      for (const secret of [EMAIL, TOKEN, RESET_LINK, ...extra]) {
        expect(logged).not.toContain(secret);
      }
    }
  }

  beforeEach(() => {
    sendMock.mockReset();
    captureEmailMock.mockReset();
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubEnv("EMAIL_FROM", "Vettr <noreply@example.com>");
    vi.stubEnv("EMAIL_CAPTURE_SINK_PATH", "");
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://vettr.example");
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    vi.unstubAllEnvs();
  });

  it("sends the reset link via Resend and returns success", async () => {
    sendMock.mockResolvedValue({ data: { id: "email_1" }, error: null });

    const result = await sendPasswordResetEmail(EMAIL, TOKEN);

    expect(result).toEqual({ success: true });
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "Vettr <noreply@example.com>",
        to: EMAIL,
        subject: "Reset your Vettr password",
      })
    );
    const { text } = sendMock.mock.calls[0][0] as { text: string };
    expect(text).toContain(RESET_LINK);
    expect(text).toContain("expires in 60 minutes");
    expect(text).toContain("If this wasn't you");
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it("falls back to the local dev origin when NEXT_PUBLIC_APP_URL is unset", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", undefined);
    sendMock.mockResolvedValue({ data: { id: "email_1" }, error: null });

    await sendPasswordResetEmail(EMAIL, TOKEN);

    const { text } = sendMock.mock.calls[0][0] as { text: string };
    expect(text).toContain(`http://localhost:3000/artist/reset-password?token=${TOKEN}`);
  });

  it("reports failure when Resend returns an error response, logging only the allowlist", async () => {
    const resendMessage = `Invalid \`to\` field: ${EMAIL} is not a verified recipient`;
    sendMock.mockResolvedValue({
      data: null,
      error: { message: resendMessage, statusCode: 422, name: "validation_error" },
    });

    const result = await sendPasswordResetEmail(EMAIL, TOKEN);

    expect(result).toEqual({ success: false });
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy).toHaveBeenCalledWith({
      operation: "sendPasswordResetEmail",
      reason: "resend_api_error",
      errorCode: "validation_error",
      statusCode: 422,
    });
    expectNoSecretsLogged(resendMessage);
  });

  it("resolves to failure, never rejecting, when the send call throws", async () => {
    const thrownMessage = `network error sending ${TOKEN} to ${EMAIL}`;
    sendMock.mockRejectedValue(new Error(thrownMessage));

    await expect(sendPasswordResetEmail(EMAIL, TOKEN)).resolves.toEqual({ success: false });

    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy).toHaveBeenCalledWith({
      operation: "sendPasswordResetEmail",
      reason: "send_threw",
    });
    expectNoSecretsLogged(thrownMessage);
  });

  it("reports failure and never calls Resend when EMAIL_FROM is unset", async () => {
    vi.stubEnv("EMAIL_FROM", "");

    const result = await sendPasswordResetEmail(EMAIL, TOKEN);

    expect(result).toEqual({ success: false });
    expect(sendMock).not.toHaveBeenCalled();
    expect(consoleErrorSpy).toHaveBeenCalledWith({
      operation: "sendPasswordResetEmail",
      reason: "missing_email_from_env",
    });
    expectNoSecretsLogged();
  });

  it("captures the reset link to the sink instead of calling Resend when the sink is enabled", async () => {
    vi.stubEnv("EMAIL_CAPTURE_SINK_PATH", "/tmp/e2e-emails.jsonl");
    captureEmailMock.mockResolvedValue(undefined);

    const result = await sendPasswordResetEmail(EMAIL, TOKEN);

    expect(result).toEqual({ success: true });
    expect(captureEmailMock).toHaveBeenCalledWith({
      to: EMAIL,
      resetLink: RESET_LINK,
      sentAt: expect.any(String),
    });
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("resolves to failure, never rejecting, when the sink write throws", async () => {
    vi.stubEnv("EMAIL_CAPTURE_SINK_PATH", "/tmp/e2e-emails.jsonl");
    const thrownMessage = `EACCES writing ${TOKEN} for ${EMAIL}`;
    captureEmailMock.mockRejectedValue(new Error(thrownMessage));

    await expect(sendPasswordResetEmail(EMAIL, TOKEN)).resolves.toEqual({ success: false });

    expect(sendMock).not.toHaveBeenCalled();
    expect(consoleErrorSpy).toHaveBeenCalledWith({
      operation: "sendPasswordResetEmail",
      reason: "capture_sink_write_failed",
    });
    expectNoSecretsLogged(thrownMessage);
  });

  it("ignores the sink and calls Resend when NODE_ENV is production", async () => {
    vi.stubEnv("EMAIL_CAPTURE_SINK_PATH", "/tmp/e2e-emails.jsonl");
    vi.stubEnv("NODE_ENV", "production");
    sendMock.mockResolvedValue({ data: { id: "email_1" }, error: null });

    const result = await sendPasswordResetEmail(EMAIL, TOKEN);

    expect(result).toEqual({ success: true });
    expect(captureEmailMock).not.toHaveBeenCalled();
    expect(sendMock).toHaveBeenCalled();
  });
});
