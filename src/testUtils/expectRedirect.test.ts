import { describe, expect, it } from "vitest";

import { redirect } from "next/navigation";

import { expectRedirect } from "./expectRedirect";

describe("expectRedirect", () => {
  it("passes when the action throws the real Next redirect to the expected url", async () => {
    await expectRedirect(
      (async () => {
        redirect("/client");
      })(),
      "/client",
    );
  });

  it("fails when the redirect target differs", async () => {
    await expect(
      expectRedirect(
        (async () => {
          redirect("/client");
        })(),
        "/artist/1",
      ),
    ).rejects.toThrow();
  });

  it("fails when the action resolves without redirecting", async () => {
    await expect(
      expectRedirect(Promise.resolve({ success: false }), "/client"),
    ).rejects.toThrow();
  });

  it("fails when the action throws a non-redirect error", async () => {
    await expect(
      expectRedirect(Promise.reject(new Error("boom")), "/client"),
    ).rejects.toThrow();
  });
});
