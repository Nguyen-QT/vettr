import { describe, expect, it } from "vitest";

import {
  buildContentSecurityPolicy,
  createCspNonce,
  CSP_HEADER_NAME,
  NONCE_REQUEST_HEADER,
} from "./contentSecurityPolicy";

const NONCE = "dGVzdC1ub25jZS12YWx1ZQ==";

function getDirective(policy: string, name: string): string[] {
  const directive = policy
    .split("; ")
    .find((entry) => entry === name || entry.startsWith(`${name} `));
  if (!directive) {
    throw new Error(`directive ${name} missing from policy`);
  }
  return directive.split(" ").slice(1);
}

function hasDirective(policy: string, name: string): boolean {
  return policy
    .split("; ")
    .some((entry) => entry === name || entry.startsWith(`${name} `));
}

describe("header names", () => {
  it("uses the enforcing header and the x-nonce request header", () => {
    expect(CSP_HEADER_NAME).toBe("Content-Security-Policy");
    expect(NONCE_REQUEST_HEADER).toBe("x-nonce");
  });
});

describe("createCspNonce", () => {
  it("returns base64 encoding at least 128 bits", () => {
    const nonce = createCspNonce();

    expect(nonce).toMatch(/^[A-Za-z0-9+/]+={0,2}$/);
    expect(atob(nonce).length).toBeGreaterThanOrEqual(16);
  });

  it("returns a different nonce on every call", () => {
    const nonces = new Set(Array.from({ length: 50 }, () => createCspNonce()));

    expect(nonces.size).toBe(50);
  });
});

describe("buildContentSecurityPolicy", () => {
  const production = buildContentSecurityPolicy({ nonce: NONCE, isDevelopment: false });
  const development = buildContentSecurityPolicy({ nonce: NONCE, isDevelopment: true });

  it("puts the nonce with 'strict-dynamic' in script-src", () => {
    const scriptSrc = getDirective(production, "script-src");

    expect(scriptSrc).toContain(`'nonce-${NONCE}'`);
    expect(scriptSrc).toContain("'strict-dynamic'");
  });

  it("keeps the nonce in script-src and, in production, style-src-elem only", () => {
    const outside = (policy: string, allowed: string[]) =>
      policy
        .split("; ")
        .filter((entry) => !allowed.some((name) => entry.startsWith(`${name} `)))
        .join("; ");

    expect(outside(production, ["script-src", "style-src-elem"])).not.toContain(NONCE);
    expect(outside(development, ["script-src"])).not.toContain(NONCE);
  });

  it("does not allow inline scripts", () => {
    expect(getDirective(production, "script-src")).not.toContain("'unsafe-inline'");
    expect(getDirective(development, "script-src")).not.toContain("'unsafe-inline'");
  });

  it("requires the nonce on <style> elements in production", () => {
    expect(getDirective(production, "style-src-elem")).toEqual(["'self'", `'nonce-${NONCE}'`]);
  });

  it("allows inline <style> elements in development, without a nonce", () => {
    expect(getDirective(development, "style-src-elem")).toEqual(["'self'", "'unsafe-inline'"]);
  });

  it.each([
    ["production", production],
    ["development", development],
  ])("allows inline style attributes, with a style-src fallback, in %s", (_mode, policy) => {
    expect(getDirective(policy, "style-src-attr")).toEqual(["'unsafe-inline'"]);
    expect(getDirective(policy, "style-src")).toEqual(["'self'", "'unsafe-inline'"]);
  });

  it("allows 'unsafe-eval' only in development", () => {
    expect(getDirective(development, "script-src")).toContain("'unsafe-eval'");
    expect(getDirective(production, "script-src")).not.toContain("'unsafe-eval'");
  });

  it("adds upgrade-insecure-requests only in production", () => {
    expect(hasDirective(production, "upgrade-insecure-requests")).toBe(true);
    expect(hasDirective(development, "upgrade-insecure-requests")).toBe(false);
  });

  it("allows Stripe.js scripts and its frames, including 3D Secure", () => {
    expect(getDirective(production, "script-src")).toEqual(
      expect.arrayContaining(["https://js.stripe.com", "https://*.js.stripe.com"]),
    );
    expect(getDirective(production, "frame-src")).toEqual(
      expect.arrayContaining([
        "https://js.stripe.com",
        "https://*.js.stripe.com",
        "https://hooks.stripe.com",
      ]),
    );
    expect(getDirective(production, "connect-src")).toContain("https://api.stripe.com");
  });

  it("allows uploads to UploadThing's ingest hosts", () => {
    expect(getDirective(production, "connect-src")).toContain(
      "https://*.ingest.uploadthing.com",
    );
  });

  it("locks down framing, plugins, base URI and form targets", () => {
    expect(getDirective(production, "frame-ancestors")).toEqual(["'none'"]);
    expect(getDirective(production, "object-src")).toEqual(["'none'"]);
    expect(getDirective(production, "base-uri")).toEqual(["'self'"]);
    expect(getDirective(production, "form-action")).toEqual(["'self'"]);
    expect(getDirective(production, "default-src")).toEqual(["'self'"]);
  });

  it("is a single line with no stray separators", () => {
    expect(production).not.toMatch(/[\n\r]/);
    expect(production).not.toMatch(/;;|; $/);
  });
});
