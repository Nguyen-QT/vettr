import { randomUUID } from "node:crypto";

import type { RequestStatus } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

// Real-database integration tier helpers (28.3). Unlike prismaMock.ts this
// uses the real `@/lib/prisma` client -- only import it from
// `*.integration.test.ts` files (vitest.integration.config.mts).
//
// Isolation strategy: every row a test creates gets unique-per-test data
// (so concurrent/leftover rows can never collide on a @unique column) and is
// tracked by id; `wipe()` deletes exactly the tracked rows (plus the rows
// hanging off them), never a whole table. Call it from `beforeEach` so a
// crashed prior run cannot poison the next one (testing.md §1).

export function uniqueSuffix(): string {
  return randomUUID().replace(/-/g, "").slice(0, 12);
}

export interface TrackedIdentity {
  id: string;
  instagramHandle: string;
  email: string;
}

export interface CreateBookingRequestInput {
  artistId: string;
  clientId: string;
  requestedStartTime?: Date;
  status?: RequestStatus;
  proposedDurationMinutes?: number;
}

// Creates a request for an already-tracked artist/client, so wipe() removes
// it (and its cascading children) without extra tracking.
export async function createBookingRequest(
  input: CreateBookingRequestInput
): Promise<{ id: string }> {
  const request = await prisma.bookingRequest.create({
    data: {
      artistId: input.artistId,
      clientId: input.clientId,
      tier: "TIER_2",
      minPrice: 50,
      maxPrice: 100,
      requestedStartTime: input.requestedStartTime,
      status: input.status,
      proposedDurationMinutes: input.proposedDurationMinutes,
    },
    select: { id: true },
  });
  return request;
}

export interface IntegrationTracker {
  createArtist(): Promise<TrackedIdentity>;
  createClientProfile(): Promise<TrackedIdentity>;
  // Registers ids of rows the test created itself (e.g. through a service
  // under test) so wipe() removes them too.
  trackAccount(id: string): void;
  trackArtist(id: string): void;
  trackClientProfile(id: string): void;
  wipe(): Promise<void>;
}

export function createIntegrationTracker(): IntegrationTracker {
  const accountIds = new Set<string>();
  const artistIds = new Set<string>();
  const clientProfileIds = new Set<string>();

  return {
    async createArtist(): Promise<TrackedIdentity> {
      const suffix = uniqueSuffix();
      const artist = await prisma.artist.create({
        data: {
          name: "Integration Test Artist",
          instagramHandle: `it_artist_${suffix}`,
          email: `it_artist_${suffix}@example.com`,
        },
      });
      artistIds.add(artist.id);
      return {
        id: artist.id,
        instagramHandle: artist.instagramHandle,
        email: artist.email,
      };
    },

    async createClientProfile(): Promise<TrackedIdentity> {
      const suffix = uniqueSuffix();
      const client = await prisma.clientProfile.create({
        data: {
          instagramHandle: `it_client_${suffix}`,
          email: `it_client_${suffix}@example.com`,
        },
      });
      clientProfileIds.add(client.id);
      return {
        id: client.id,
        instagramHandle: client.instagramHandle,
        email: client.email,
      };
    },

    trackAccount(id: string): void {
      accountIds.add(id);
    },
    trackArtist(id: string): void {
      artistIds.add(id);
    },
    trackClientProfile(id: string): void {
      clientProfileIds.add(id);
    },

    async wipe(): Promise<void> {
      const accounts = [...accountIds];
      const artists = [...artistIds];
      const clients = [...clientProfileIds];

      // Accounts hold the FK to Artist/ClientProfile, so they go first
      // (Session cascades; AuditEvent.accountId is SetNull, so audit rows
      // for these accounts are removed explicitly to avoid orphans).
      // Includes accounts linked to a tracked artist/client even if the
      // test never tracked the account itself.
      const linkedAccounts = await prisma.account.findMany({
        where: {
          OR: [
            { id: { in: accounts } },
            { artistId: { in: artists } },
            { clientProfileId: { in: clients } },
          ],
        },
        select: { id: true },
      });
      const allAccountIds = linkedAccounts.map((a) => a.id);

      await prisma.auditEvent.deleteMany({
        where: { accountId: { in: allAccountIds } },
      });
      await prisma.account.deleteMany({ where: { id: { in: allAccountIds } } });

      // BookingRequest children (DesignReference, Addon, TimeSlot) cascade.
      await prisma.bookingRequest.deleteMany({
        where: {
          OR: [{ artistId: { in: artists } }, { clientId: { in: clients } }],
        },
      });
      await prisma.timeSlot.deleteMany({ where: { artistId: { in: artists } } });
      await prisma.artistWeeklyHours.deleteMany({
        where: { artistId: { in: artists } },
      });
      await prisma.artistScheduleOverride.deleteMany({
        where: { artistId: { in: artists } },
      });
      await prisma.tierReferenceImage.deleteMany({
        where: { artistId: { in: artists } },
      });
      await prisma.artistDepositSetting.deleteMany({
        where: { artistId: { in: artists } },
      });

      await prisma.clientProfile.deleteMany({ where: { id: { in: clients } } });
      await prisma.artist.deleteMany({ where: { id: { in: artists } } });

      accountIds.clear();
      artistIds.clear();
      clientProfileIds.clear();
    },
  };
}
