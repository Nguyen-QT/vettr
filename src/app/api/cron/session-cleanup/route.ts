import { createHash, timingSafeEqual } from "node:crypto";

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { pruneExpiredSessions } from "@/domains/auth/services/pruneExpiredSessions";

const BEARER_PREFIX = "Bearer ";

// Hashing both sides yields equal-length buffers, so timingSafeEqual never
// throws on a length mismatch and the compare leaks nothing about length.
function isValidToken(provided: string, expected: string): boolean {
  const providedDigest = createHash("sha256").update(provided).digest();
  const expectedDigest = createHash("sha256").update(expected).digest();
  return timingSafeEqual(providedDigest, expectedDigest);
}

// Route Handler (CLAUDE.md 27.4.3.1): thin delivery only -- authenticates the
// scheduler's bearer token and delegates to pruneExpiredSessions. Fails closed
// when CRON_SECRET is unset, and every auth failure returns the same generic
// 401 so the response reveals nothing about why it was rejected.
export async function POST(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");

  if (
    !secret ||
    !authorization ||
    !authorization.startsWith(BEARER_PREFIX) ||
    !isValidToken(authorization.slice(BEARER_PREFIX.length), secret)
  ) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const startedAt = Date.now();

  try {
    const deletedCount = await pruneExpiredSessions();
    return NextResponse.json({
      deletedCount,
      durationMs: Date.now() - startedAt,
    });
  } catch (error) {
    console.error("Session cleanup failed:", error);
    return NextResponse.json({ error: "Session cleanup failed." }, { status: 500 });
  }
}
