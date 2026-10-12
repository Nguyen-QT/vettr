import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { retryOwedDepositRefunds } from "@/domains/billing/services/retryOwedDepositRefunds";
import type { RetryOwedDepositRefundsResult } from "@/domains/billing/types";
import { isAuthorizedCronRequest } from "@/lib/cronAuth";

// One Stripe call with stripe-node's own retries can take minutes. The
// sweep's time budget only stops new rows from starting, so the route needs
// headroom past it.
export const maxDuration = 300;

// Route Handler (CLAUDE.md 56.7.3.2): thin delivery only -- authenticates the
// scheduler's bearer token (isAuthorizedCronRequest) and delegates to
// retryOwedDepositRefunds. Fails closed when CRON_SECRET is unset, and every
// auth failure returns the same generic 401 so the response reveals nothing
// about why it was rejected.
//
// Per-row failures are caught and counted inside the sweep, so they still
// answer 200. A sweep that throws (its candidate read failed) returns the
// generic 500 so the scheduled job fails visibly; the next run retries it.
export async function POST(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const startedAt = Date.now();
  let result: RetryOwedDepositRefundsResult;

  try {
    result = await retryOwedDepositRefunds();
  } catch (error) {
    console.error("Deposit refund retry failed:", error);
    return NextResponse.json({ error: "Deposit refund retry failed." }, { status: 500 });
  }

  return NextResponse.json({
    ...result,
    durationMs: Date.now() - startedAt,
  });
}
