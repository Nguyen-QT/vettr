// Pure view (CLAUDE.md 12.1.1): static copy, no props, no logic --
// laying out the request -> review -> deposit -> locked-in sequence
// explicitly, so a client isn't surprised that approval doesn't
// itself confirm the slot. Its own component (not inlined into the
// booking form/page) since Phase 17's wizard Step 4 summary is
// explicitly meant to reuse it once that ships.
const STEPS = [
  {
    title: "Submit your request",
    description:
      "Tell the artist about your idea, share reference images, and pick a preferred date and time.",
  },
  {
    title: "The artist reviews it",
    description:
      "They'll approve or decline based on availability and fit -- this isn't an automatic booking.",
  },
  {
    title: "Pay your deposit",
    description:
      "Once approved, you'll be asked to pay a deposit. Your time slot isn't locked in until this is paid.",
  },
  {
    title: "You're booked",
    description: "With the deposit paid, your appointment is confirmed.",
  },
];

export function BookingProcessExplainer() {
  return (
    <section className="mb-4 rounded-lg border border-border bg-muted/30 p-4">
      <h2 className="mb-3 text-sm font-semibold">How booking works</h2>
      <ol className="flex flex-col gap-3">
        {STEPS.map((step, index) => (
          <li key={step.title} className="flex gap-3">
            <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-medium text-primary-foreground">
              {index + 1}
            </span>
            <div>
              <p className="text-sm font-medium">{step.title}</p>
              <p className="text-sm text-muted-foreground">{step.description}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
