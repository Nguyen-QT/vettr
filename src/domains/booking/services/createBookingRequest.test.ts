import { prismaMock } from "@/testUtils/prismaMock";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { mockDeep, mockReset } from "vitest-mock-extended";

import { Prisma, type PrismaClient } from "@/generated/prisma/client";

import { CREATE_BOOKING_REQUEST_UNEXPECTED_ERROR_MESSAGE } from "../constants";
import type { CreateBookingRequestInput } from "../types";
import { createBookingRequest } from "./createBookingRequest";

// Mocked-Prisma unit test (architecture.md Sec7). $transaction hands the
// callback a separate tx mock, so the tests prove every write goes through
// the transaction rather than the global client. The real-DB double-verify
// proof is 54.5.2.6.
const txMock = mockDeep<Prisma.TransactionClient>();

const CLIENT_PROFILE_ID = "client_profile_1";
const ARTIST_ID = "artist_1";
const FIRST_NAME = "Ada";
const LAST_NAME = "Lovelace";
const DATE_OF_BIRTH = "1995-04-12";
const PHONE = "07700900123";
const CLIENT_NOTES = "Soft gradient across the ring finger";
const IMAGE_URLS = ["https://utfs.io/f/ref-one.jpg", "https://utfs.io/f/ref-two.jpg"];

const GENERIC_ERROR = {
  success: false,
  error: CREATE_BOOKING_REQUEST_UNEXPECTED_ERROR_MESSAGE,
};

function fullInput(): CreateBookingRequestInput {
  return {
    clientProfileId: CLIENT_PROFILE_ID,
    artistId: ARTIST_ID,
    designReferenceImageUrls: IMAGE_URLS,
    tier: "TIER_3",
    clientBudgetRange: { minPrice: 100, maxPrice: 200 },
    designTags: ["fine-line-detail", "custom-illustration"],
    aestheticTags: ["watercolor-blend"],
    phone: PHONE,
    firstName: FIRST_NAME,
    lastName: LAST_NAME,
    dateOfBirth: DATE_OF_BIRTH,
    clientNotes: CLIENT_NOTES,
    requestedDate: "2026-11-02",
    requestedTime: "14:00",
    clientMaxEndTime: "17:00",
    paymentMethod: "CARD",
  };
}

function minimalInput(): CreateBookingRequestInput {
  return {
    clientProfileId: CLIENT_PROFILE_ID,
    artistId: ARTIST_ID,
    designReferenceImageUrls: [IMAGE_URLS[0]],
    tier: "FREESTYLE",
    clientBudgetRange: { minPrice: 50, maxPrice: 500 },
    firstName: FIRST_NAME,
    lastName: LAST_NAME,
    dateOfBirth: DATE_OF_BIRTH,
    requestedDate: "2026-11-02",
    requestedTime: "11:00",
    paymentMethod: "CASH",
  };
}

function foreignKeyViolation(): Prisma.PrismaClientKnownRequestError {
  // The message echoes PII, so the log assertions prove it's never logged.
  return new Prisma.PrismaClientKnownRequestError(
    `Foreign key constraint failed for ${FIRST_NAME} ${LAST_NAME} ${PHONE}`,
    { code: "P2003", clientVersion: "test" }
  );
}

describe("createBookingRequest", () => {
  let consoleErrorSpy: MockInstance<typeof console.error>;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockReset(txMock);
    prismaMock.$transaction.mockImplementation(
      ((callback: (tx: Prisma.TransactionClient) => unknown) =>
        callback(txMock)) as PrismaClient["$transaction"]
    );
    txMock.clientProfile.updateMany.mockResolvedValue({ count: 1 });
    txMock.bookingRequest.create.mockResolvedValue({ id: "booking_request_1" } as never);
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it("creates a PENDING request with its design references inside one transaction", async () => {
    const result = await createBookingRequest(fullInput());

    expect(result).toEqual({ success: true, bookingRequestId: "booking_request_1" });
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(txMock.bookingRequest.create).toHaveBeenCalledTimes(1);
    expect(txMock.bookingRequest.create).toHaveBeenCalledWith({
      data: {
        status: "PENDING",
        clientId: CLIENT_PROFILE_ID,
        artistId: ARTIST_ID,
        tier: "TIER_3",
        minPrice: 100,
        maxPrice: 200,
        designTags: ["fine-line-detail", "custom-illustration"],
        aestheticTags: ["watercolor-blend"],
        clientNotes: CLIENT_NOTES,
        requestedStartTime: new Date("2026-11-02T14:00:00"),
        clientMaxEndTime: new Date("2026-11-02T17:00:00"),
        paymentMethod: "CARD",
        designReferences: {
          create: [{ imageUrl: IMAGE_URLS[0] }, { imageUrl: IMAGE_URLS[1] }],
        },
      },
      select: { id: true },
    });
    expect(prismaMock.bookingRequest.create).not.toHaveBeenCalled();
    expect(prismaMock.clientProfile.update).not.toHaveBeenCalled();
    expect(prismaMock.clientProfile.updateMany).not.toHaveBeenCalled();
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it("defaults absent optional fields: empty tags, null max end time, no notes", async () => {
    await createBookingRequest(minimalInput());

    expect(txMock.bookingRequest.create).toHaveBeenCalledWith({
      data: {
        status: "PENDING",
        clientId: CLIENT_PROFILE_ID,
        artistId: ARTIST_ID,
        tier: "FREESTYLE",
        minPrice: 50,
        maxPrice: 500,
        designTags: [],
        aestheticTags: [],
        clientNotes: undefined,
        requestedStartTime: new Date("2026-11-02T11:00:00"),
        clientMaxEndTime: null,
        paymentMethod: "CASH",
        designReferences: { create: [{ imageUrl: IMAGE_URLS[0] }] },
      },
      select: { id: true },
    });
  });

  it("fills each blank profile field with a null-guarded updateMany, DOB at UTC midnight", async () => {
    await createBookingRequest(fullInput());

    expect(txMock.clientProfile.updateMany).toHaveBeenCalledTimes(4);
    expect(txMock.clientProfile.updateMany).toHaveBeenCalledWith({
      where: { id: CLIENT_PROFILE_ID, firstName: null },
      data: { firstName: FIRST_NAME },
    });
    expect(txMock.clientProfile.updateMany).toHaveBeenCalledWith({
      where: { id: CLIENT_PROFILE_ID, lastName: null },
      data: { lastName: LAST_NAME },
    });
    expect(txMock.clientProfile.updateMany).toHaveBeenCalledWith({
      where: { id: CLIENT_PROFILE_ID, dateOfBirth: null },
      data: { dateOfBirth: new Date("1995-04-12T00:00:00.000Z") },
    });
    expect(txMock.clientProfile.updateMany).toHaveBeenCalledWith({
      where: { id: CLIENT_PROFILE_ID, phone: null },
      data: { phone: PHONE },
    });
    expect(txMock.clientProfile.update).not.toHaveBeenCalled();
  });

  it("leaves phone untouched when the draft has none", async () => {
    await createBookingRequest(minimalInput());

    expect(txMock.clientProfile.updateMany).toHaveBeenCalledTimes(3);
    const touchedFields = txMock.clientProfile.updateMany.mock.calls.flatMap(([args]) =>
      Object.keys(args.data)
    );
    expect(touchedFields).toEqual(["firstName", "lastName", "dateOfBirth"]);
  });

  it("returns the generic error and logs the Prisma code when the create fails", async () => {
    txMock.bookingRequest.create.mockRejectedValue(foreignKeyViolation());

    const result = await createBookingRequest(fullInput());

    expect(result).toEqual(GENERIC_ERROR);
    expect(consoleErrorSpy.mock.calls).toStrictEqual([
      [{ operation: "createBookingRequest", reason: "unexpected_failure", errorCode: "P2003" }],
    ]);
  });

  it("returns the generic error without creating when a profile fill fails", async () => {
    txMock.clientProfile.updateMany.mockRejectedValueOnce(new Error("connection lost"));

    const result = await createBookingRequest(fullInput());

    expect(result).toEqual(GENERIC_ERROR);
    expect(txMock.bookingRequest.create).not.toHaveBeenCalled();
    expect(consoleErrorSpy.mock.calls).toStrictEqual([
      [{ operation: "createBookingRequest", reason: "unexpected_failure", errorCode: undefined }],
    ]);
  });

  it("never logs the client's details", async () => {
    txMock.bookingRequest.create.mockRejectedValue(foreignKeyViolation());

    await createBookingRequest(fullInput());

    const logged = JSON.stringify(consoleErrorSpy.mock.calls);
    for (const detail of [
      FIRST_NAME,
      LAST_NAME,
      PHONE,
      DATE_OF_BIRTH,
      CLIENT_NOTES,
      ...IMAGE_URLS,
    ]) {
      expect(logged).not.toContain(detail);
    }
  });
});
