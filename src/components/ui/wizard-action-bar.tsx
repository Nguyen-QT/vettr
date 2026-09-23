import { cn } from "cn";

function WizardActionBar({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="wizard-action-bar"
      className={cn(
        "sticky bottom-0 z-10 -mx-4 mt-4 flex items-center justify-between gap-2 border-t border-border bg-background px-4 py-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]",
        className
      )}
      {...props}
    />
  );
}

export { WizardActionBar };
