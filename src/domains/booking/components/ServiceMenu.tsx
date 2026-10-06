import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";

import type { ServiceMenuProps } from "../types";

const PILL_CLASS_NAME =
  "inline-flex w-fit items-center rounded-full border border-border bg-background px-3 py-1 text-sm text-muted-foreground";

// Pure view (54.1.4.2): renders the public `/@handle` service menu from
// buildServiceMenu's output -- one card per tier with its deposit and
// baseline budget, linking into the booking wizard with the tier
// preselected. A null deposit means none is configured, so none is
// charged. Section dividers are owned by the page (54.1.6.1).
export function ServiceMenu({ artistHandle, items }: ServiceMenuProps) {
  return (
    <section
      aria-labelledby="service-menu-heading"
      className="flex flex-col gap-6 py-8"
    >
      <h2
        id="service-menu-heading"
        className="text-2xl font-bold tracking-tight text-foreground"
      >
        Services
      </h2>

      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {items.map((item) => (
          <li
            key={item.tier}
            className="flex flex-col gap-4 rounded-xl border border-border bg-card p-6 shadow-sm"
          >
            <div className="flex flex-col gap-3">
              <h3 className="text-lg font-semibold text-foreground">
                {item.label}
              </h3>
              <span className={PILL_CLASS_NAME}>
                {item.depositAmount !== null
                  ? `£${item.depositAmount} deposit`
                  : "No deposit"}
              </span>
            </div>

            <p className="text-sm text-muted-foreground">
              Typical budget £{item.baselineBudget.minPrice} – £
              {item.baselineBudget.maxPrice}
            </p>

            <Link
              href={`/@${artistHandle}/book?service=${item.tier}`}
              aria-label={`Request ${item.label}`}
              className={buttonVariants({ className: "mt-auto w-full" })}
            >
              Request
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
