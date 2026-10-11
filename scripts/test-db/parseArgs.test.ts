import { describe, expect, it } from "vitest";

import { parseArgs } from "./parseArgs";

const KNOWN_SCRIPTS: ReadonlySet<string> = new Set([
  "test:integration",
  "test:e2e",
  "test:e2e:ui",
]);

describe("parseArgs", () => {
  it("returns the scripts in order, with no port check by default", () => {
    expect(parseArgs(["test:integration", "test:e2e"], KNOWN_SCRIPTS)).toEqual({
      requireFreePort: null,
      scripts: ["test:integration", "test:e2e"],
    });
  });

  it("reads --require-free-port wherever it appears", () => {
    expect(
      parseArgs(["test:e2e", "--require-free-port=3000"], KNOWN_SCRIPTS),
    ).toEqual({ requireFreePort: 3000, scripts: ["test:e2e"] });
  });

  it("accepts the port bounds 1 and 65535", () => {
    expect(
      parseArgs(["--require-free-port=1", "test:e2e"], KNOWN_SCRIPTS)
        .requireFreePort,
    ).toBe(1);
    expect(
      parseArgs(["--require-free-port=65535", "test:e2e"], KNOWN_SCRIPTS)
        .requireFreePort,
    ).toBe(65535);
  });

  it.each(["0", "65536", "-1", "30.5", "abc", ""])(
    "rejects the port %j",
    (port) => {
      expect(() =>
        parseArgs([`--require-free-port=${port}`, "test:e2e"], KNOWN_SCRIPTS),
      ).toThrow(/not a valid port/);
    },
  );

  it("rejects an unknown option", () => {
    expect(() => parseArgs(["--keep", "test:e2e"], KNOWN_SCRIPTS)).toThrow(
      /Unknown option "--keep"/,
    );
  });

  it("rejects a name with shell metacharacters, even if package.json had it", () => {
    const hostile = "test:e2e&calc";
    expect(() => parseArgs([hostile], new Set([hostile]))).toThrow(
      /not a valid npm script name/,
    );
  });

  it("rejects a script that isn't in package.json", () => {
    expect(() => parseArgs(["test:nope"], KNOWN_SCRIPTS)).toThrow(
      /No npm script named "test:nope"/,
    );
  });

  it("rejects a call with no scripts", () => {
    expect(() => parseArgs([], KNOWN_SCRIPTS)).toThrow(/at least one npm script/);
    expect(() =>
      parseArgs(["--require-free-port=3000"], KNOWN_SCRIPTS),
    ).toThrow(/at least one npm script/);
  });
});
