import { randomUUID } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";

import {
  ACCOUNT_ALREADY_EXISTS_ERROR_MESSAGE,
  NO_BOOKING_FOUND_ERROR_MESSAGE,
} from "../constants";
import { hashPassword } from "./hashPassword";
import { signupClient } from "./signupClient";

describe("signupClient", () => {
  let clientProfileId: string;
  let email: string;
  const password = "correct horse battery staple";

  beforeEach(async () => {
    clientProfileId = randomUUID();
    email = `${clientProfileId}@example.com`;
    await prisma.clientProfile.create({
      data: {
        id: clientProfileId,
        instagramHandle: `test_client_${clientProfileId.slice(0, 8)}`,
        email,
      },
    });
  });

  afterEach(async () => {
    const account = await prisma.account.findUnique({ where: { email } });
    if (account) {
      await prisma.session.deleteMany({ where: { accountId: account.id } });
      await prisma.account.delete({ where: { id: account.id } });
    }
    await prisma.clientProfile.delete({ where: { id: clientProfileId } });
  });

  it("links a new account and session to the matching ClientProfile", async () => {
    const result = await signupClient({ email, password });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.clientProfileId).toBe(clientProfileId);

    const account = await prisma.account.findUnique({ where: { email } });
    expect(account).toMatchObject({ role: "CLIENT", clientProfileId });

    const session = await prisma.session.findUnique({
      where: { id: result.sessionId },
    });
    expect(session).not.toBeNull();
  });

  it("rejects an email with no matching ClientProfile", async () => {
    const result = await signupClient({
      email: "no-such-booking@example.com",
      password,
    });

    expect(result).toEqual({
      success: false,
      error: NO_BOOKING_FOUND_ERROR_MESSAGE,
    });
  });

  it("rejects signup when the ClientProfile already has an account", async () => {
    await prisma.account.create({
      data: {
        email,
        passwordHash: await hashPassword(password),
        role: "CLIENT",
        clientProfileId,
      },
    });

    const result = await signupClient({ email, password: "a-different-password" });

    expect(result).toEqual({
      success: false,
      error: ACCOUNT_ALREADY_EXISTS_ERROR_MESSAGE,
    });
  });
});
