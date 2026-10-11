import { describe, expect, it } from "vitest";

import { parseDockerPort } from "./parseDockerPort";

describe("parseDockerPort", () => {
  it("reads an IPv4 loopback binding", () => {
    expect(parseDockerPort("127.0.0.1:55012\n")).toBe(55012);
  });

  it("reads an IPv6 binding", () => {
    expect(parseDockerPort("[::]:55012\n")).toBe(55012);
  });

  it("reads the first line when there is one per address family", () => {
    expect(parseDockerPort("0.0.0.0:55012\n[::]:55013\n")).toBe(55012);
  });

  it("handles Windows line endings and surrounding whitespace", () => {
    expect(parseDockerPort("  127.0.0.1:55012  \r\n")).toBe(55012);
  });

  it("skips a line without a usable port", () => {
    expect(parseDockerPort("127.0.0.1:0\n127.0.0.1:55012\n")).toBe(55012);
  });

  it.each(["", "\n", "Error: No public port '5432/tcp' published", "127.0.0.1:70000"])(
    "throws on %j",
    (output) => {
      expect(() => parseDockerPort(output)).toThrow(/host port/);
    },
  );
});
