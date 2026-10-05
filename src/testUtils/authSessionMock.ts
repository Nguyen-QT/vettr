import { beforeEach, vi } from "vitest";

import type { SessionWithAccount } from "@/domains/auth/types";

// Opt-in helper for tests of code that resolves the session through
// auth/actions.ts's own getCurrentSession() -- a same-module call that
// vi.mock("@/domains/auth/actions") cannot intercept. It fakes the two real
// inputs instead: the next/headers cookie store and getSessionWithAccount.
// Import this module before the module under test (same hoisting caveat as
// prismaMock.ts).
const { cookieStore, getSessionWithAccountMock } = vi.hoisted(() => ({
  cookieStore: {
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
  },
  getSessionWithAccountMock: vi.fn(),
}));

export { cookieStore, getSessionWithAccountMock };

vi.mock("next/headers", () => ({
  cookies: async () => cookieStore,
}));

vi.mock("@/domains/auth/services/getSessionWithAccount", () => ({
  getSessionWithAccount: (...args: unknown[]) =>
    getSessionWithAccountMock(...args),
}));

export const TEST_SESSION_ID = "test-session-id";

const BASE_SESSION: SessionWithAccount = {
  sessionId: TEST_SESSION_ID,
  expiresAt: new Date("2099-01-01T00:00:00.000Z"),
  accountId: "account-1",
  role: "CLIENT",
  activeRole: "CLIENT",
  artistId: null,
  clientProfileId: "client-1",
};

export function mockSignedIn(
  overrides: Partial<SessionWithAccount> = {},
): SessionWithAccount {
  const session: SessionWithAccount = { ...BASE_SESSION, ...overrides };
  cookieStore.get.mockReturnValue({ value: session.sessionId });
  getSessionWithAccountMock.mockResolvedValue(session);
  return session;
}

// Cookie present but no live session behind it (expired/unknown id).
export function mockStaleCookie(sessionId: string = TEST_SESSION_ID): void {
  cookieStore.get.mockReturnValue({ value: sessionId });
  getSessionWithAccountMock.mockResolvedValue(null);
}

export function mockSignedOut(): void {
  cookieStore.get.mockReturnValue(undefined);
  getSessionWithAccountMock.mockResolvedValue(null);
}

beforeEach(() => {
  cookieStore.get.mockReset();
  cookieStore.set.mockReset();
  cookieStore.delete.mockReset();
  getSessionWithAccountMock.mockReset();
  mockSignedOut();
});
