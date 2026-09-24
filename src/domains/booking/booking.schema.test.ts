import { describe, expect, it } from "vitest";

import {
  clientBookingInputSchema,
  designReferenceImagesSchema,
  instagramHandleSchema,
} from "./booking.schema";

describe("instagramHandleSchema", () => {
  it("accepts a plain handle", () => {
    const result = instagramHandleSchema.safeParse("nail.artist_99");
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe("nail.artist_99");
  });

  it("strips a leading @", () => {
    const result = instagramHandleSchema.safeParse("@nailartist");
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe("nailartist");
  });

  it("trims surrounding whitespace", () => {
    const result = instagramHandleSchema.safeParse("  nailartist  ");
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe("nailartist");
  });

  it("rejects an empty handle", () => {
    expect(instagramHandleSchema.safeParse("").success).toBe(false);
  });

  it("rejects a handle that is only an @ sign", () => {
    expect(instagramHandleSchema.safeParse("@").success).toBe(false);
  });

  it("accepts a handle exactly 30 characters long", () => {
    expect(instagramHandleSchema.safeParse("a".repeat(30)).success).toBe(true);
  });

  it("rejects handles longer than 30 characters", () => {
    expect(instagramHandleSchema.safeParse("a".repeat(31)).success).toBe(false);
  });

  it("rejects handles with spaces", () => {
    expect(instagramHandleSchema.safeParse("nail artist").success).toBe(false);
  });

  it("rejects handles with disallowed symbols", () => {
    expect(instagramHandleSchema.safeParse("nail-artist!").success).toBe(false);
  });

  it("rejects a handle starting with a period", () => {
    expect(instagramHandleSchema.safeParse(".nailartist").success).toBe(false);
  });

  it("rejects a handle ending with an underscore preceded by nothing else valid", () => {
    expect(instagramHandleSchema.safeParse("_").success).toBe(false);
  });
});

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
    const { email: _email, ...payloadWithoutEmail } = validPayload;
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
    const { paymentMethod: _paymentMethod, ...payloadWithoutPaymentMethod } =
      validPayload;
    const result = clientBookingInputSchema.safeParse(payloadWithoutPaymentMethod);
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
    const { firstName: _firstName, ...payloadWithoutFirstName } = validPayload;
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
