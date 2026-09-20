import { describe, expect, it } from "vitest";

import { generateResponseMessage } from "./generateResponseMessage";

describe("generateResponseMessage", () => {
  it("returns approval copy for APPROVED", () => {
    expect(generateResponseMessage("APPROVED")).toMatch(/approved/i);
  });

  it("returns decline copy for DECLINED", () => {
    expect(generateResponseMessage("DECLINED")).toMatch(/not able to take/i);
  });

  it("returns distinct copy per outcome", () => {
    expect(generateResponseMessage("APPROVED")).not.toBe(
      generateResponseMessage("DECLINED")
    );
  });
});
