import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { prisma } from "@/lib/prisma";
import { createIntegrationTracker, uniqueSuffix } from "@/testUtils/integrationDb";

import { linkOrCreateClientProfileForAccount } from "./linkOrCreateClientProfileForAccount";

// Real-database auth tests (28.3.2.3): the races and FK behaviours the
// mocked unit tier cannot prove.
const tracker = createIntegrationTracker();

async function createClientAccount(
  email: string = `it_account_${uniqueSuffix()}@example.com`
): Promise<{ id: string; email: string }> {
  const account = await prisma.account.create({
    data: { email, passwordHash: "x", role: "CLIENT" },
  });
  tracker.trackAccount(account.id);
  return { id: account.id, email: account.email };
}

describe("auth integration", () => {
  beforeEach(async () => {
    await tracker.wipe();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterAll(async () => {
    await tracker.wipe();
    await prisma.$disconnect();
  });

  describe("linkOrCreateClientProfileForAccount concurrency", () => {
    it("two accounts racing on the same instagramHandle yield one winner and a handled loser", async () => {
      const handle = `it_client_${uniqueSuffix()}`;
      const [a, b] = await Promise.all([createClientAccount(), createClientAccount()]);

      const results = await Promise.all([
        linkOrCreateClientProfileForAccount(a.id, { instagramHandle: handle }),
        linkOrCreateClientProfileForAccount(b.id, { instagramHandle: handle }),
      ]);

      const winners = results.filter((r) => r.success);
      const losers = results.filter((r) => !r.success);
      expect(winners).toHaveLength(1);
      expect(losers).toHaveLength(1);
      // Handled: a plain result object, never a rejected promise or raw P2002 text.
      const loser = losers[0];
      expect(loser.success === false && loser.error).toBeTruthy();
      expect(JSON.stringify(loser)).not.toContain("P2002");

      const profiles = await prisma.clientProfile.findMany({
        where: { instagramHandle: handle },
        include: { account: true },
      });
      expect(profiles).toHaveLength(1);
      tracker.trackClientProfile(profiles[0].id);
      expect(profiles[0].account).not.toBeNull();
    });

    it("a double-submit from one account (same email) creates exactly one profile", async () => {
      const account = await createClientAccount();

      const results = await Promise.all([
        linkOrCreateClientProfileForAccount(account.id, {
          instagramHandle: `it_client_${uniqueSuffix()}`,
        }),
        linkOrCreateClientProfileForAccount(account.id, {
          instagramHandle: `it_client_${uniqueSuffix()}`,
        }),
      ]);

      expect(results.filter((r) => r.success)).toHaveLength(1);
      const loser = results.find((r) => !r.success);
      expect(loser).toBeDefined();
      expect(JSON.stringify(loser)).not.toContain("P2002");

      const profiles = await prisma.clientProfile.findMany({
        where: { email: account.email },
      });
      expect(profiles).toHaveLength(1);
      tracker.trackClientProfile(profiles[0].id);
    });
  });

  describe("cascades", () => {
    it("deleting an Account cascades to its Sessions", async () => {
      const account = await createClientAccount();
      await prisma.session.createMany({
        data: [1, 2].map(() => ({
          accountId: account.id,
          activeRole: "CLIENT" as const,
          expiresAt: new Date(Date.now() + 60_000),
        })),
      });
      expect(await prisma.session.count({ where: { accountId: account.id } })).toBe(2);

      await prisma.account.delete({ where: { id: account.id } });

      expect(await prisma.session.count({ where: { accountId: account.id } })).toBe(0);
    });

    it("deleting a ClientProfile nulls Account.clientProfileId and keeps the Account", async () => {
      const client = await tracker.createClientProfile();
      const account = await prisma.account.create({
        data: {
          email: `it_account_${uniqueSuffix()}@example.com`,
          passwordHash: "x",
          role: "CLIENT",
          clientProfileId: client.id,
        },
      });
      tracker.trackAccount(account.id);

      await prisma.clientProfile.delete({ where: { id: client.id } });

      const after = await prisma.account.findUnique({ where: { id: account.id } });
      expect(after).not.toBeNull();
      expect(after?.clientProfileId).toBeNull();
    });
  });
});
