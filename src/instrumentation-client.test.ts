import { describe, expect, it } from "vitest";
import { z } from "zod";

import "./instrumentation-client";

describe("instrumentation-client", () => {
  it("turns off Zod's eval-based JIT", () => {
    expect(z.config().jitless).toBe(true);
  });

  it("still parses and rejects object schemas built afterwards", () => {
    const schema = z.object({ handle: z.string().min(1), count: z.number() });

    expect(schema.parse({ handle: "ink", count: 2 })).toEqual({ handle: "ink", count: 2 });
    expect(schema.safeParse({ handle: "", count: "2" }).success).toBe(false);
  });
});
