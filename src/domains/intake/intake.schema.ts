import { z } from "zod";

// Real Instagram handle rules: 1-30 chars, letters/digits/periods/
// underscores, and must start and end on an alphanumeric character.
export const INSTAGRAM_HANDLE_REGEX =
  /^[a-zA-Z0-9](?:[a-zA-Z0-9._]{0,28}[a-zA-Z0-9])?$/;

export const instagramHandleSchema = z
  .string()
  .trim()
  .transform((value) => (value.startsWith("@") ? value.slice(1) : value))
  .pipe(
    z
      .string()
      .min(1, "Instagram handle is required.")
      .max(30, "Instagram handle must be 30 characters or fewer.")
      .regex(INSTAGRAM_HANDLE_REGEX, "Enter a valid Instagram handle.")
  );

export const MIN_DESIGN_REFERENCE_IMAGES = 1;
export const MAX_DESIGN_REFERENCE_IMAGES = 5;

// Visual Enforcement (CLAUDE.md): every request must carry at least one
// high-resolution design reference image.
export const designReferenceImagesSchema = z
  .array(z.url("Each design reference must be a valid image URL."))
  .min(
    MIN_DESIGN_REFERENCE_IMAGES,
    "At least one design reference image is required."
  )
  .max(
    MAX_DESIGN_REFERENCE_IMAGES,
    `You can attach up to ${MAX_DESIGN_REFERENCE_IMAGES} design reference images.`
  );

// Client-supplied fields only. Artist-controlled state (estimatedPrice,
// depositPaid, enforcePrecharge, cancellationCount) is set elsewhere and
// never accepted as input here.
export const clientIntakeInputSchema = z.object({
  instagramHandle: instagramHandleSchema,
  designReferenceImageUrls: designReferenceImagesSchema,
  email: z.email().optional(),
  phone: z.string().trim().min(1).optional(),
  notes: z.string().trim().max(1000).optional(),
});

export type ClientIntakeInput = z.infer<typeof clientIntakeInputSchema>;
