import Image from "next/image";

import { COMPLEXITY_TIERS, COMPLEXITY_TIER_LABELS } from "../constants";
import type { PortfolioGalleryProps } from "../types";

// Pure view (54.1.4.3): renders the public `/@handle` portfolio from the
// artist's tier reference images, grouped by tier in service-menu order.
// Tiers without images are hidden; when none have any, a single empty
// state is shown. Section dividers are owned by the page (54.1.6.1).
export function PortfolioGallery({ imagesByTier }: PortfolioGalleryProps) {
  const groups = COMPLEXITY_TIERS.filter(
    (tier) => imagesByTier[tier].length > 0
  );

  return (
    <section
      aria-labelledby="portfolio-heading"
      className="flex flex-col gap-6 py-8"
    >
      <h2
        id="portfolio-heading"
        className="text-2xl font-bold tracking-tight text-foreground"
      >
        Portfolio
      </h2>

      {groups.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-6">
          <p className="text-sm text-muted-foreground">
            No portfolio images yet.
          </p>
        </div>
      ) : (
        groups.map((tier) => (
          <div key={tier} className="flex flex-col gap-4">
            <h3 className="text-lg font-semibold text-foreground">
              {COMPLEXITY_TIER_LABELS[tier]}
            </h3>
            <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              {imagesByTier[tier].map((url, index) => (
                // Index keys: imageUrl has no unique constraint.
                <li
                  key={`${tier}-${index}`}
                  className="relative aspect-square overflow-hidden rounded-xl border border-border bg-muted"
                >
                  <Image
                    src={url}
                    alt={`${COMPLEXITY_TIER_LABELS[tier]} example ${index + 1}`}
                    fill
                    sizes="(min-width: 640px) 33vw, 50vw"
                    className="object-cover"
                  />
                </li>
              ))}
            </ul>
          </div>
        ))
      )}
    </section>
  );
}
