import { randomUUID } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";

import { INVALID_CREDENTIALS_ERROR_MESSAGE } from "../constants";
import { hashPassword } from "./hashPassword";
import { loginClient } from "./loginClient";

describe("loginClient", () => {
  let clientProfileId: string;
  let email: string;
  const password = "correct horse battery staple";

  beforeEach(async () => {
    clientProfileId = randomUUID();
    email = `${clientProfileId}-account@example.com`;
    await prisma.clientProfile.create({
      data: {
        id: clientProfileId,
        instagramHandle: `test_client_${clientProfileId.slice(0, 8)}`,
        email: `${clientProfileId}@example.com`,
      },
    });
    await prisma.account.create({
      data: {
        email,
        passwordHash: await hashPassword(password),
        role: "CLIENT",
        clientProfileId,
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

  it("creates a session and returns the linked clientProfileId for correct credentials", async () => {
    const result = await loginClient({ email, password });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.clientProfileId).toBe(clientProfileId);

    const session = await prisma.session.findUnique({
      where: { id: result.sessionId },
    });
    expect(session).not.toBeNull();
  });

  it("rejects an incorrect password without creating a session", async () => {
    const result = await loginClient({ email, password: "wrong password" });

    expect(result).toEqual({
      success: false,
      error: INVALID_CREDENTIALS_ERROR_MESSAGE,
    });
  });

  it("rejects an email with no matching account", async () => {
    const result = await loginClient({
      email: "no-such-account@example.com",
      password,
    });

    expect(result).toEqual({
      success: false,
      error: INVALID_CREDENTIALS_ERROR_MESSAGE,
    });
  });

  it("rejects a non-CLIENT account even with the correct password", async () => {
    const artistId = randomUUID();
    await prisma.artist.create({
      data: {
        id: artistId,
        name: "Login Client Test Artist",
        instagramHandle: `test_artist_${artistId.slice(0, 8)}`,
        email: `${artistId}@example.com`,
      },
    });
    const artistEmail = `${artistId}-account@example.com`;
    await prisma.account.create({
      data: {
        email: artistEmail,
        passwordHash: await hashPassword(password),
        role: "ARTIST",
        artistId,
      },
    });

    const result = await loginClient({ email: artistEmail, password });

    expect(result).toEqual({
      success: false,
      error: INVALID_CREDENTIALS_ERROR_MESSAGE,
    });

    await prisma.account.delete({ where: { email: artistEmail } });
    await prisma.artist.delete({ where: { id: artistId } });
  });
});
