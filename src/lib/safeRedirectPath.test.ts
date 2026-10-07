import { describe, expect, it } from "vitest";

import { safeRedirectPath } from "./safeRedirectPath";

// Distinct from every allowed path, so "accepted" and "fell back" never
// look the same.
const FALLBACK = "/fallback";

function redirect(
  candidate: string | null | undefined,
  allowedPrefixes: readonly string[] = ["/client"]
): string {
  return safeRedirectPath(candidate, { allowedPrefixes, fallback: FALLBACK });
}

describe("safeRedirectPath", () => {
  describe("accepts", () => {
    it.each([
      ["/client", "/client"],
      ["/client/bookings", "/client/bookings"],
      ["/client/bookings?tab=past#top", "/client/bookings?tab=past#top"],
      ["/client?next=//evil.com", "/client?next=//evil.com"],
      ["/client#//evil.com", "/client#//evil.com"],
      ["/client/", "/client/"],
    ])("%j", (candidate, expected) => {
      expect(redirect(candidate)).toBe(expected);
    });

    it("returns the path with dot segments resolved", () => {
      expect(redirect("/client/./bookings")).toBe("/client/bookings");
    });

    it("returns the path with non-ASCII percent-encoded", () => {
      expect(redirect("/client/café")).toBe("/client/caf%C3%A9");
    });

    it("matches any of several prefixes", () => {
      expect(redirect("/artist/abc", ["/client", "/artist"])).toBe(
        "/artist/abc"
      );
    });

    it("treats a bare '/' prefix as any same-origin path", () => {
      expect(redirect("/anything/here", ["/"])).toBe("/anything/here");
    });

    it("treats a trailing-slash prefix as strictly below it", () => {
      expect(redirect("/client/x", ["/client/"])).toBe("/client/x");
      expect(redirect("/client", ["/client/"])).toBe(FALLBACK);
    });
  });

  describe("falls back", () => {
    it.each([[null], [undefined], [""]])("for %j", (candidate) => {
      expect(redirect(candidate)).toBe(FALLBACK);
    });

    it.each([
      ["javascript:alert(1)"],
      ["https://evil.com"],
      ["data:text/html,x"],
    ])("for the scheme %j", (candidate) => {
      expect(redirect(candidate)).toBe(FALLBACK);
    });

    it.each([["client"], ["./client"], ["evil.com"]])(
      "for the relative path %j",
      (candidate) => {
        expect(redirect(candidate)).toBe(FALLBACK);
      }
    );

    it.each([["//evil.com"], ["///evil.com"], ["//evil.com/client"]])(
      "for the protocol-relative %j",
      (candidate) => {
        expect(redirect(candidate)).toBe(FALLBACK);
      }
    );

    it.each([["/\\evil.com"], ["\\\\evil.com"], ["/client\\..\\artist"]])(
      "for the backslash form %j",
      (candidate) => {
        expect(redirect(candidate)).toBe(FALLBACK);
      }
    );

    it.each([
      ["/\t/evil.com"],
      ["/\n/evil.com"],
      ["/\r/evil.com"],
      [" /client"],
      ["/client "],
      ["/cli\u0000ent"],
      ["/client\u007f"],
      ["/client\u0085"],
      ["/client "],
    ])("for whitespace or a control character in %j", (candidate) => {
      expect(redirect(candidate)).toBe(FALLBACK);
    });

    it("for an unparseable host", () => {
      expect(redirect("//[")).toBe(FALLBACK);
    });

    it.each([
      ["/client/.."],
      ["/client/../artist/1"],
      ["/client/%2e%2e/artist/1"],
      ["/client/.%2E/artist/1"],
    ])("when %j resolves outside the prefix", (candidate) => {
      expect(redirect(candidate)).toBe(FALLBACK);
    });

    // The "//" guard is the only check standing between a bare "/" prefix
    // and these, so cover both prefix shapes.
    it.each([
      ["/.//evil.com", ["/client"]],
      ["/client/..//evil.com", ["/client"]],
      ["/.//evil.com", ["/"]],
      ["/client/..//evil.com", ["/"]],
    ])("when %j resolves to a protocol-relative path (prefixes %j)", (candidate, prefixes) => {
      expect(redirect(candidate, prefixes)).toBe(FALLBACK);
    });

    it.each([["/clients"], ["/client-evil"], ["/clientevil"]])(
      "for %j, which only shares characters with the prefix",
      (candidate) => {
        expect(redirect(candidate)).toBe(FALLBACK);
      }
    );

    it("for a different case", () => {
      expect(redirect("/CLIENT")).toBe(FALLBACK);
    });

    it("for the root when only /client is allowed", () => {
      expect(redirect("/")).toBe(FALLBACK);
    });

    it("when no prefixes are allowed", () => {
      expect(redirect("/client", [])).toBe(FALLBACK);
    });
  });
});
