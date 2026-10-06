import type { BookingPoliciesProps } from "../types";

const PILL_CLASS_NAME =
  "inline-flex w-fit items-center rounded-full border border-border bg-background px-3 py-1 text-sm text-muted-foreground";

// Pure view (54.1.4.4): renders the public `/@handle` booking policies --
// deposit, cancellation window, and strike -> precharge. Every rule value
// is passed in, so the copy always matches what cancelBookingRequest,
// applyCancellationStrike and createDepositPaymentIntent enforce.
// Section dividers are owned by the page (54.1.6.1).
export function BookingPolicies({
  cancellationWindowHours,
  strikeThreshold,
  prechargePercentage,
}: BookingPoliciesProps) {
  const prechargePercent = Math.round(prechargePercentage * 100);

  const policies = [
    {
      title: "Deposit",
      pill: "Paid after approval",
      description:
        "If your service has a deposit, you'll pay it once the artist approves your request. Your slot is only locked in once it's paid, and it counts towards your final price.",
    },
    {
      title: "Cancellations",
      pill: `${cancellationWindowHours}h notice`,
      description: `Cancel at least ${cancellationWindowHours} hours before your appointment for a full deposit refund. Inside ${cancellationWindowHours} hours, contact the artist directly.`,
    },
    {
      title: "Missed appointments",
      pill: `${prechargePercent}% precharge`,
      description: `Cancelling an approved booking or not showing up counts as a strike. After ${strikeThreshold} ${
        strikeThreshold === 1 ? "strike" : "strikes"
      }, future deposits are at least ${prechargePercent}% of the artist's estimated price.`,
    },
  ];

  return (
    <section
      aria-labelledby="booking-policies-heading"
      className="flex flex-col gap-6 py-8"
    >
      <h2
        id="booking-policies-heading"
        className="text-2xl font-bold tracking-tight text-foreground"
      >
        Booking policies
      </h2>

      <ul className="grid grid-cols-1 gap-4">
        {policies.map((policy) => (
          <li
            key={policy.title}
            className="flex flex-col gap-3 rounded-xl border border-border bg-card p-6 shadow-sm"
          >
            <h3 className="text-lg font-semibold text-foreground">
              {policy.title}
            </h3>
            <span className={PILL_CLASS_NAME}>{policy.pill}</span>
            <p className="text-sm text-muted-foreground">
              {policy.description}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
