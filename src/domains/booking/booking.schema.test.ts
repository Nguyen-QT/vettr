import { describe, expect, it } from "vitest";

import {
  bookingRequestDraftInputSchema,
  clientBookingInputSchema,
  designReferenceImagesSchema,
  submitBookingRequestWithCodeInputSchema,
} from "./booking.schema";

const validPayload = {
  instagramHandle: "nailartist",
  designReferenceImageUrls: ["https://files.example.com/ref-1.png"],
  tier: "TIER_2" as const,
  clientBudgetRange: { minPrice: 50, maxPrice: 100 },
  designTags: ["fine-line-detail" as const],
  email: "client@example.com",
  firstName: "Jamie",
  lastName: "Rivera",
  dateOfBirth: "2000-01-01",
  requestedDate: "2027-01-01",
  requestedTime: "11:00" as const,
  paymentMethod: "CARD" as const,
};

const freestylePayload = {
  instagramHandle: "nailartist",
  designReferenceImageUrls: ["https://files.example.com/ref-1.png"],
  tier: "FREESTYLE" as const,
  clientBudgetRange: { minPrice: 50, maxPrice: 500 },
  aestheticTags: ["watercolor-blend" as const],
  email: "client@example.com",
  firstName: "Jamie",
  lastName: "Rivera",
  dateOfBirth: "2000-01-01",
  requestedDate: "2027-01-01",
  requestedTime: "11:00" as const,
  paymentMethod: "CARD" as const,
};

describe("designReferenceImagesSchema", () => {
  it("rejects an empty array", () => {
    expect(designReferenceImagesSchema.safeParse([]).success).toBe(false);
  });

  it("accepts a single valid image URL", () => {
    const result = designReferenceImagesSchema.safeParse([
      "https://files.example.com/ref-1.png",
    ]);
    expect(result.success).toBe(true);
  });

  it("accepts up to 5 valid image URLs", () => {
    const urls = Array.from(
      { length: 5 },
      (_, i) => `https://files.example.com/ref-${i}.png`
    );
    expect(designReferenceImagesSchema.safeParse(urls).success).toBe(true);
  });

  it("rejects more than 5 image URLs", () => {
    const urls = Array.from(
      { length: 6 },
      (_, i) => `https://files.example.com/ref-${i}.png`
    );
    expect(designReferenceImagesSchema.safeParse(urls).success).toBe(false);
  });

  it("rejects a non-URL string", () => {
    expect(designReferenceImagesSchema.safeParse(["not-a-url"]).success).toBe(
      false
    );
  });

  it("rejects the array when any entry is invalid", () => {
    const result = designReferenceImagesSchema.safeParse([
      "https://files.example.com/ref-1.png",
      "not-a-url",
    ]);
    expect(result.success).toBe(false);
  });
});

describe("clientBookingInputSchema", () => {
  it("accepts the minimum required fields for a non-FREESTYLE tier", () => {
    expect(clientBookingInputSchema.safeParse(validPayload).success).toBe(true);
  });

  it("accepts the minimum required fields for FREESTYLE", () => {
    expect(clientBookingInputSchema.safeParse(freestylePayload).success).toBe(
      true
    );
  });

  it("accepts optional phone and clientNotes", () => {
    const result = clientBookingInputSchema.safeParse({
      ...validPayload,
      phone: "+1 555 0100",
      clientNotes: "Prefers weekday afternoons.",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a malformed email", () => {
    const result = clientBookingInputSchema.safeParse({
      ...validPayload,
      email: "not-an-email",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a missing email", () => {
    const { email: _, ...payloadWithoutEmail } = validPayload;
    const result = clientBookingInputSchema.safeParse(payloadWithoutEmail);
    expect(result.success).toBe(false);
  });

  it("rejects a blank phone string", () => {
    const result = clientBookingInputSchema.safeParse({
      ...validPayload,
      phone: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects when designReferenceImageUrls is missing", () => {
    const result = clientBookingInputSchema.safeParse({
      ...validPayload,
      designReferenceImageUrls: undefined,
    });
    expect(result.success).toBe(false);
  });

  it("rejects when instagramHandle is missing", () => {
    const result = clientBookingInputSchema.safeParse({
      ...validPayload,
      instagramHandle: undefined,
    });
    expect(result.success).toBe(false);
  });

  it("rejects a budget where maxPrice is not greater than minPrice", () => {
    const result = clientBookingInputSchema.safeParse({
      ...validPayload,
      clientBudgetRange: { minPrice: 100, maxPrice: 100 },
    });
    expect(result.success).toBe(false);
  });

  it("rejects a budget amount that is not a multiple of 5", () => {
    const result = clientBookingInputSchema.safeParse({
      ...validPayload,
      clientBudgetRange: { minPrice: 52, maxPrice: 100 },
    });
    expect(result.success).toBe(false);
  });

  it("rejects a non-positive budget amount", () => {
    const result = clientBookingInputSchema.safeParse({
      ...validPayload,
      clientBudgetRange: { minPrice: 0, maxPrice: 100 },
    });
    expect(result.success).toBe(false);
  });

  it("rejects TIER_2/3/4 requests with no designTags", () => {
    const result = clientBookingInputSchema.safeParse({
      ...validPayload,
      designTags: undefined,
    });
    expect(result.success).toBe(false);
  });

  it("rejects FREESTYLE requests with no aestheticTags", () => {
    const result = clientBookingInputSchema.safeParse({
      ...freestylePayload,
      aestheticTags: undefined,
    });
    expect(result.success).toBe(false);
  });

  it("ignores an empty designTags array on FREESTYLE (aestheticTags governs instead)", () => {
    const result = clientBookingInputSchema.safeParse({
      ...freestylePayload,
      designTags: [],
    });
    expect(result.success).toBe(true);
  });

  it("requires clientNotes when OTHER is selected in designTags", () => {
    const result = clientBookingInputSchema.safeParse({
      ...validPayload,
      designTags: ["OTHER" as const],
    });
    expect(result.success).toBe(false);
  });

  it("accepts OTHER in designTags when clientNotes is provided", () => {
    const result = clientBookingInputSchema.safeParse({
      ...validPayload,
      designTags: ["OTHER" as const],
      clientNotes: "A custom piece I'll describe over a call.",
    });
    expect(result.success).toBe(true);
  });

  it("requires clientNotes when OTHER is selected in aestheticTags", () => {
    const result = clientBookingInputSchema.safeParse({
      ...freestylePayload,
      aestheticTags: ["OTHER" as const],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a requestedDate/requestedTime combination in the past", () => {
    const result = clientBookingInputSchema.safeParse({
      ...validPayload,
      requestedDate: "2020-01-01",
      requestedTime: "11:00" as const,
    });
    expect(result.success).toBe(false);
  });

  it("accepts CASH as a payment method", () => {
    const result = clientBookingInputSchema.safeParse({
      ...validPayload,
      paymentMethod: "CASH",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a missing paymentMethod", () => {
    const result = clientBookingInputSchema.safeParse({
      ...validPayload,
      paymentMethod: undefined,
    });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid paymentMethod value", () => {
    const result = clientBookingInputSchema.safeParse({
      ...validPayload,
      paymentMethod: "PAYPAL",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a requestedTime outside the fixed daily options", () => {
    const result = clientBookingInputSchema.safeParse({
      ...validPayload,
      requestedTime: "09:00",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a malformed requestedDate", () => {
    const result = clientBookingInputSchema.safeParse({
      ...validPayload,
      requestedDate: "not-a-date",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a missing firstName", () => {
    const { firstName: _, ...payloadWithoutFirstName } = validPayload;
    const result = clientBookingInputSchema.safeParse(payloadWithoutFirstName);
    expect(result.success).toBe(false);
  });

  it("rejects a blank lastName", () => {
    const result = clientBookingInputSchema.safeParse({
      ...validPayload,
      lastName: "  ",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a client under the minimum age", () => {
    const under18 = new Date();
    under18.setFullYear(under18.getFullYear() - 17);
    const result = clientBookingInputSchema.safeParse({
      ...validPayload,
      dateOfBirth: under18.toISOString().slice(0, 10),
    });
    expect(result.success).toBe(false);
  });

  it("accepts a client exactly at the minimum age", () => {
    const exactly18 = new Date();
    exactly18.setFullYear(exactly18.getFullYear() - 18);
    const result = clientBookingInputSchema.safeParse({
      ...validPayload,
      dateOfBirth: exactly18.toISOString().slice(0, 10),
    });
    expect(result.success).toBe(true);
  });

  it("rejects a malformed dateOfBirth", () => {
    const result = clientBookingInputSchema.safeParse({
      ...validPayload,
      dateOfBirth: "not-a-date",
    });
    expect(result.success).toBe(false);
  });

  it("accepts an omitted clientMaxEndTime", () => {
    expect(clientBookingInputSchema.safeParse(validPayload).success).toBe(true);
  });

  it("accepts an empty string clientMaxEndTime, same as omitted", () => {
    // An untouched <input type="time"> reports "" via react-hook-form,
    // not undefined -- this must not be treated as a malformed time.
    const result = clientBookingInputSchema.safeParse({
      ...validPayload,
      clientMaxEndTime: "",
    });
    expect(result.success).toBe(true);
  });

  it("accepts a clientMaxEndTime after the requested start time", () => {
    const result = clientBookingInputSchema.safeParse({
      ...validPayload,
      requestedTime: "11:00" as const,
      clientMaxEndTime: "14:00",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a clientMaxEndTime at or before the requested start time", () => {
    const result = clientBookingInputSchema.safeParse({
      ...validPayload,
      requestedTime: "14:00" as const,
      clientMaxEndTime: "11:00",
    });
    expect(result.success).toBe(false);
  });

  it("accepts a clientMaxEndTime exactly 90 minutes after the start time", () => {
    const result = clientBookingInputSchema.safeParse({
      ...validPayload,
      requestedTime: "11:00" as const,
      clientMaxEndTime: "12:30",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a clientMaxEndTime less than 90 minutes after the start time", () => {
    const result = clientBookingInputSchema.safeParse({
      ...validPayload,
      requestedTime: "11:00" as const,
      clientMaxEndTime: "12:00",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a malformed clientMaxEndTime", () => {
    const result = clientBookingInputSchema.safeParse({
      ...validPayload,
      clientMaxEndTime: "not-a-time",
    });
    expect(result.success).toBe(false);
  });
});

// The draft extends clientBookingInputSchema, so the field-by-field matrix
// above still applies -- these prove the two overrides (54.5.3.1) and that
// the base refinements and key stripping survive the extension.
describe("bookingRequestDraftInputSchema", () => {
  it("accepts the minimum required fields for a non-FREESTYLE tier", () => {
    expect(bookingRequestDraftInputSchema.safeParse(validPayload).success).toBe(true);
  });

  it("accepts the minimum required fields for FREESTYLE", () => {
    expect(bookingRequestDraftInputSchema.safeParse(freestylePayload).success).toBe(true);
  });

  it("normalises the email", () => {
    const result = bookingRequestDraftInputSchema.safeParse({
      ...validPayload,
      email: "  Client@Example.COM ",
    });
    expect(result.success && result.data.email).toBe("client@example.com");
  });

  it("rejects an invalid email with the generic message", () => {
    const result = bookingRequestDraftInputSchema.safeParse({
      ...validPayload,
      email: "not-an-email",
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe("Enter a valid email address.");
  });

  it.each(["", "   "])("treats phone %j as not provided", (phone) => {
    const result = bookingRequestDraftInputSchema.safeParse({ ...validPayload, phone });
    expect(result.success).toBe(true);
    expect(result.data?.phone).toBeUndefined();
  });

  it("trims a real phone number", () => {
    const result = bookingRequestDraftInputSchema.safeParse({
      ...validPayload,
      phone: " +1 555 0100 ",
    });
    expect(result.success && result.data.phone).toBe("+1 555 0100");
  });

  it("accepts an omitted phone", () => {
    const result = bookingRequestDraftInputSchema.safeParse(validPayload);
    expect(result.success).toBe(true);
    expect(result.data?.phone).toBeUndefined();
  });

  it.each([
    ["a past requested date", { requestedDate: "2020-01-01" }, "requestedDate"],
    [
      "a must-finish-by time under the minimum gap",
      { requestedTime: "11:00" as const, clientMaxEndTime: "12:00" },
      "clientMaxEndTime",
    ],
    ["no design tags", { designTags: undefined }, "designTags"],
    ["OTHER with no notes", { designTags: ["OTHER" as const] }, "clientNotes"],
  ])("keeps the base refinement: rejects %s", (_, override, path) => {
    const result = bookingRequestDraftInputSchema.safeParse({ ...validPayload, ...override });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual([path]);
  });

  it("strips client-supplied identity keys", () => {
    const result = bookingRequestDraftInputSchema.safeParse({
      ...validPayload,
      artistId: "artist-hostile",
      clientProfileId: "profile-hostile",
      accountId: "account-hostile",
    });
    expect(result.success).toBe(true);
    expect(result.data).not.toHaveProperty("artistId");
    expect(result.data).not.toHaveProperty("clientProfileId");
    expect(result.data).not.toHaveProperty("accountId");
  });
});

describe("submitBookingRequestWithCodeInputSchema", () => {
  const validSubmitPayload = { ...validPayload, code: "123456" };

  it("accepts the draft plus a code, with the email normalised", () => {
    const result = submitBookingRequestWithCodeInputSchema.safeParse({
      ...validSubmitPayload,
      email: "  Client@Example.COM ",
    });
    expect(result.success).toBe(true);
    expect(result.data?.email).toBe("client@example.com");
    expect(result.data?.code).toBe("123456");
  });

  it("keeps a leading-zero code as a string", () => {
    const result = submitBookingRequestWithCodeInputSchema.safeParse({
      ...validSubmitPayload,
      code: "001234",
    });
    expect(result.success && result.data.code).toBe("001234");
  });

  it.each(["12345", "1234567", "12a456", "", "123 56", " 123456"])(
    "rejects code %j",
    (code) => {
      expect(
        submitBookingRequestWithCodeInputSchema.safeParse({ ...validSubmitPayload, code })
          .success
      ).toBe(false);
    }
  );

  it("rejects a missing code", () => {
    expect(submitBookingRequestWithCodeInputSchema.safeParse(validPayload).success).toBe(false);
  });

  it("treats a blank phone as not provided", () => {
    const result = submitBookingRequestWithCodeInputSchema.safeParse({
      ...validSubmitPayload,
      phone: "",
    });
    expect(result.success).toBe(true);
    expect(result.data?.phone).toBeUndefined();
  });

  it("keeps the base refinements: rejects a past requested date", () => {
    const result = submitBookingRequestWithCodeInputSchema.safeParse({
      ...validSubmitPayload,
      requestedDate: "2020-01-01",
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["requestedDate"]);
  });

  it("strips client-supplied identity keys", () => {
    const result = submitBookingRequestWithCodeInputSchema.safeParse({
      ...validSubmitPayload,
      artistId: "artist-hostile",
      clientProfileId: "profile-hostile",
    });
    expect(result.success).toBe(true);
    expect(result.data).not.toHaveProperty("artistId");
    expect(result.data).not.toHaveProperty("clientProfileId");
  });
});
