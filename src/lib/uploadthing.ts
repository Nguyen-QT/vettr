import { createUploadthing, type FileRouter } from "uploadthing/next";

import {
  MAX_DESIGN_REFERENCE_IMAGES,
  MIN_DESIGN_REFERENCE_IMAGES,
} from "@/domains/booking/constants";

const f = createUploadthing();

// Visual Enforcement (CLAUDE.md): the booking form only ever needs to
// collect high-resolution design reference images, so this is the sole
// endpoint. Boundaries mirror booking.schema.ts's array bounds.
export const uploadRouter = {
  designReferenceImages: f({
    image: {
      maxFileSize: "16MB",
      minFileCount: MIN_DESIGN_REFERENCE_IMAGES,
      maxFileCount: MAX_DESIGN_REFERENCE_IMAGES,
    },
  }).onUploadComplete(({ file }) => {
    return { url: file.ufsUrl };
  }),
} satisfies FileRouter;

export type UploadRouter = typeof uploadRouter;
