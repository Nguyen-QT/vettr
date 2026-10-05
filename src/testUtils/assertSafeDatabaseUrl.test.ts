import { describe, expect, it } from "vitest";

import { assertSafeDatabaseUrl } from "./assertSafeDatabaseUrl";

describe("assertSafeDatabaseUrl", () => {
  it("accepts a localhost database regardless of its name", () => {
    expect(() =>
      assertSafeDatabaseUrl("postgresql://u:p@localhost:5432/vettr"),
    ).not.toThrow();
  });

  it("accepts 127.0.0.1 and [::1]", () => {
    expect(() =>
      assertSafeDatabaseUrl("postgresql://u:p@127.0.0.1:5432/vettr"),
    ).not.toThrow();
    expect(() =>
      assertSafeDatabaseUrl("postgresql://u:p@[::1]:5432/vettr"),
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

  it("rejects an undefined or empty DATABASE_URL", () => {
    expect(() => assertSafeDatabaseUrl(undefined)).toThrow(/refusing to run/);
    expect(() => assertSafeDatabaseUrl("")).toThrow(/refusing to run/);
  });

  it("rejects an unparseable DATABASE_URL", () => {
    expect(() => assertSafeDatabaseUrl("not a url")).toThrow(/refusing to run/);
  });

  it("never leaks the connection string (credentials) in the error", () => {
    let message = "";
    try {
      assertSafeDatabaseUrl("postgresql://admin:hunter2@db.example.com/vettr");
    } catch (error) {
      message = error instanceof Error ? error.message : "";
    }
    expect(message).not.toBe("");
    expect(message).not.toContain("hunter2");
  });
});
