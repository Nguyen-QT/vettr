import { expect } from "vitest";

import { isRedirectError } from "next/dist/client/components/redirect-error";
import { getURLFromRedirectError } from "next/dist/client/components/redirect";

// Deliberately does NOT mock "next/navigation": the real redirect() throws
// Next's own NEXT_REDIRECT error (with the `NEXT_REDIRECT;<type>;<url>;<status>;`
// digest), so asserting through Next's own isRedirectError /
// getURLFromRedirectError keeps controller tests faithful to the runtime
// -- a mocked redirect() that returns would let code fall through past it.
export async function expectRedirect(
  action: Promise<unknown>,
  expectedUrl: string,
): Promise<void> {
  let caught: unknown;
  try {
    await action;
  } catch (error) {
    caught = error;
  }

  expect(
    isRedirectError(caught),
    "expected the action to throw a NEXT_REDIRECT error",
  ).toBe(true);
  if (!isRedirectError(caught)) return;
  expect(getURLFromRedirectError(caught)).toBe(expectedUrl);
}
