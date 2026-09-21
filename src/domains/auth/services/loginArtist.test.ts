import { randomUUID } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";

import { INVALID_CREDENTIALS_ERROR_MESSAGE } from "../constants";
import { hashPassword } from "./hashPassword";
import { loginArtist } from "./loginArtist";

describe("loginArtist", () => {
  let artistId: string;
  let email: string;
  const password = "correct horse battery staple";

  beforeEach(async () => {
    artistId = randomUUID();
    email = `${artistId}-account@example.com`;
    await prisma.artist.create({
      data: {
        id: artistId,
        name: "Login Test Artist",
        instagramHandle: `test_artist_${artistId.slice(0, 8)}`,
        email: `${artistId}@example.com`,
      },
    });
    await prisma.account.create({
      data: {
        email,
        passwordHash: await hashPassword(password),
        role: "ARTIST",
        artistId,
      },
    });
  });

  afterEach(async () => {
    const account = await prisma.account.findUnique({ where: { email } });
    if (account) {
      await prisma.session.deleteMany({ where: { accountId: account.id } });
      await prisma.account.delete({ where: { id: account.id } });
    }
    await prisma.artist.delete({ where: { id: artistId } });
  });

  it("creates a session and returns the linked artistId for correct credentials", async () => {
    const result = await loginArtist({ email, password });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.artistId).toBe(artistId);

    const session = await prisma.session.findUnique({
      where: { id: result.sessionId },
    });
    expect(session).not.toBeNull();
  });

  it("rejects an incorrect password without creating a session", async () => {
    const result = await loginArtist({ email, password: "wrong password" });

    expect(result).toEqual({
      success: false,
      error: INVALID_CREDENTIALS_ERROR_MESSAGE,
    });
  });

  it("rejects an email with no matching account", async () => {
    const result = await loginArtist({
      email: "no-such-account@example.com",
      password,
    });

    expect(result).toEqual({
      success: false,
      error: INVALID_CREDENTIALS_ERROR_MESSAGE,
    });
  });

  it("rejects a non-ARTIST account even with the correct password", async () => {
    const clientProfileId = randomUUID();
    await prisma.clientProfile.create({
      data: {
        id: clientProfileId,
        instagramHandle: `test_client_${clientProfileId.slice(0, 8)}`,
        email: `${clientProfileId}@example.com`,
      },
    });
    const clientEmail = `${clientProfileId}-account@example.com`;
    await prisma.account.create({
      data: {
        email: clientEmail,
        passwordHash: await hashPassword(password),
        role: "CLIENT",
        clientProfileId,
      },
    });

    const result = await loginArtist({ email: clientEmail, password });

    expect(result).toEqual({
      success: false,
      error: INVALID_CREDENTIALS_ERROR_MESSAGE,
    });

    await prisma.account.delete({ where: { email: clientEmail } });
    await prisma.clientProfile.delete({ where: { id: clientProfileId } });
  });
});
