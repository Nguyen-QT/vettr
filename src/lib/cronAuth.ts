// Scheduler bearer-token check. Single app-side owner of the cron auth
// rules; shared by every /api/cron route (architecture.md 4.B) -- do not
// fork.

import { createHash, timingSafeEqual } from "node:crypto";

const BEARER_PREFIX = "Bearer ";

// Hashing both sides yields equal-length buffers, so timingSafeEqual never
// throws on a length mismatch and the compare leaks nothing about length.
function isValidToken(provided: string, expected: string): boolean {
  const providedDigest = createHash("sha256").update(provided).digest();
  const expectedDigest = createHash("sha256").update(expected).digest();
  return timingSafeEqual(providedDigest, expectedDigest);
}

// Pure and never throws. True only for `Authorization: Bearer <CRON_SECRET>`.
// Fails closed when CRON_SECRET is unset or empty. The secret is read per
// call, so a rotated value applies without a restart. Returns no reason, so
// callers answer every failure with the same generic 401.
export function isAuthorizedCronRequest(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");

  return (
    !!secret &&
    !!authorization &&
    authorization.startsWith(BEARER_PREFIX) &&
    isValidToken(authorization.slice(BEARER_PREFIX.length), secret)
  );
}
