import { describe, expect, it } from "vitest";

import { assertSafeDatabaseUrl } from "./assertSafeDatabaseUrl";

describe("assertSafeDatabaseUrl", () => {
  it("rejects the localhost dev database (no 'test' in its name)", () => {
    expect(() =>
      assertSafeDatabaseUrl("postgresql://u:p@localhost:5432/vettr"),
    ).toThrow(/refusing to run/);
  });

  it("rejects 127.0.0.1 and [::1] with a non-test database name", () => {
    expect(() =>
      assertSafeDatabaseUrl("postgresql://u:p@127.0.0.1:5432/vettr"),
    ).toThrow(/refusing to run/);
    expect(() =>
      assertSafeDatabaseUrl("postgresql://u:p@[::1]:5432/vettr"),
    ).toThrow(/refusing to run/);
  });

  it("accepts a localhost test database (the throwaway wrapper and CI shape)", () => {
    expect(() =>
      assertSafeDatabaseUrl(
        "postgresql://postgres:postgres@127.0.0.1:55432/vettr_test?schema=public",
      ),
    ).not.toThrow();
  });

  it("accepts a remote host when the database name contains 'test'", () => {
    expect(() =>
      assertSafeDatabaseUrl("postgresql://u:p@db.example.com:5432/vettr_Test"),
    ).not.toThrow();
  });

  it("rejects a remote host with a non-test database name", () => {
    expect(() =>
      assertSafeDatabaseUrl("postgresql://u:p@db.example.com:5432/vettr"),
    ).toThrow(/refusing to run/);
  });

  it("ignores 'test' in the user, host or query string", () => {
    expect(() =>
      assertSafeDatabaseUrl(
        "postgresql://test:test@test-host:5432/vettr?schema=test",
      ),
    ).toThrow(/refusing to run/);
  });

  it("rejects a connection string with no database name", () => {
    expect(() =>
      assertSafeDatabaseUrl("postgresql://u:p@localhost:5432"),
    ).toThrow(/refusing to run/);
    expect(() =>
      assertSafeDatabaseUrl("postgresql://u:p@localhost:5432/"),
    ).toThrow(/refusing to run/);
  });

  it("decodes a percent-encoded database name", () => {
    expect(() =>
      assertSafeDatabaseUrl("postgresql://u:p@localhost:5432/vettr%5Ftest"),
    ).not.toThrow();
  });

  it("rejects a malformed percent-encoded database name with the generic error", () => {
    expect(() =>
      assertSafeDatabaseUrl("postgresql://u:p@localhost:5432/vettr%zz"),
    ).toThrow(/refusing to run/);
  });

  it("rejects an undefined or empty DATABASE_URL", () => {
    expect(() => assertSafeDatabaseUrl(undefined)).toThrow(/refusing to run/);
    expect(() => assertSafeDatabaseUrl("")).toThrow(/refusing to run/);
  });

  it("rejects an unparseable DATABASE_URL", () => {
    expect(() => assertSafeDatabaseUrl("not a url")).toThrow(/refusing to run/);
  });

  it("never leaks the connection string (credentials) in the error", () => {
    for (const url of [
      "postgresql://admin:hunter2@db.example.com/vettr",
      "postgresql://admin:hunter2@localhost:5432/vettr",
    ]) {
      let message = "";
      try {
        assertSafeDatabaseUrl(url);
      } catch (error) {
        message = error instanceof Error ? error.message : "";
      }
      expect(message).not.toBe("");
      expect(message).not.toContain("hunter2");
    }
  });
});
