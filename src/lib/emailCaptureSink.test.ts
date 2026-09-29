import { readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

import { afterEach, describe, expect, it, vi } from "vitest";

import { captureEmail, getEmailCaptureSinkPath } from "./emailCaptureSink";

describe("getEmailCaptureSinkPath", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns null when EMAIL_CAPTURE_SINK_PATH is unset", () => {
    vi.stubEnv("EMAIL_CAPTURE_SINK_PATH", "");
    vi.stubEnv("NODE_ENV", "test");
    expect(getEmailCaptureSinkPath()).toBeNull();
  });

  it("returns the path when set outside production", () => {
    vi.stubEnv("EMAIL_CAPTURE_SINK_PATH", "/tmp/emails.jsonl");
    vi.stubEnv("NODE_ENV", "test");
    expect(getEmailCaptureSinkPath()).toBe("/tmp/emails.jsonl");
  });

  it("returns null when NODE_ENV is production, even if the path is set", () => {
    vi.stubEnv("EMAIL_CAPTURE_SINK_PATH", "/tmp/emails.jsonl");
    vi.stubEnv("NODE_ENV", "production");
    expect(getEmailCaptureSinkPath()).toBeNull();
  });
});

describe("captureEmail", () => {
  let sinkPath: string;

  afterEach(async () => {
    vi.unstubAllEnvs();
    await rm(sinkPath, { force: true });
  });

  it("appends a JSONL record", async () => {
    sinkPath = join(tmpdir(), `email-sink-${randomUUID()}.jsonl`);
    vi.stubEnv("EMAIL_CAPTURE_SINK_PATH", sinkPath);
    vi.stubEnv("NODE_ENV", "test");

    await captureEmail({ to: "a@example.com", code: "111111", sentAt: "2026-09-29T00:00:00.000Z" });
    await captureEmail({ to: "b@example.com", code: "222222", sentAt: "2026-09-29T00:00:01.000Z" });

    const lines = (await readFile(sinkPath, "utf8")).trim().split("\n");
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0])).toEqual({
      to: "a@example.com",
      code: "111111",
      sentAt: "2026-09-29T00:00:00.000Z",
    });
    expect(JSON.parse(lines[1])).toEqual({
      to: "b@example.com",
      code: "222222",
      sentAt: "2026-09-29T00:00:01.000Z",
    });
  });

  it("is a no-op when the sink is disabled", async () => {
    sinkPath = join(tmpdir(), `email-sink-${randomUUID()}.jsonl`);
    vi.stubEnv("EMAIL_CAPTURE_SINK_PATH", "");
    vi.stubEnv("NODE_ENV", "test");

    await captureEmail({ to: "a@example.com", code: "111111", sentAt: "2026-09-29T00:00:00.000Z" });

    await expect(readFile(sinkPath, "utf8")).rejects.toThrow();
  });

  it("escapes a newline-injection attempt in `to` into a single, round-trippable line", async () => {
    sinkPath = join(tmpdir(), `email-sink-${randomUUID()}.jsonl`);
    vi.stubEnv("EMAIL_CAPTURE_SINK_PATH", sinkPath);
    vi.stubEnv("NODE_ENV", "test");

    const maliciousTo = 'attacker\n{"to":"victim@example.com"}';
    await captureEmail({ to: maliciousTo, code: "111111", sentAt: "2026-09-29T00:00:00.000Z" });

    const content = await readFile(sinkPath, "utf8");
    const lines = content.trim().split("\n");
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]).to).toBe(maliciousTo);
  });
});
