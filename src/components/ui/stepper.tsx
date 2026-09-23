import { CheckIcon } from "lucide-react";
import { cn } from "cn";

interface StepperProps {
  steps: readonly string[];
  currentStep: number;
  // The highest step index the caller currently considers reachable
  // (e.g. every step up to and including the first one that hasn't
  // passed its own validation yet). Purely a rendering input -- the
  // wizard's step/progress hook owns deciding what that value is.
  furthestStep: number;
  onStepSelect?: (index: number) => void;
}

function Stepper({ steps, currentStep, furthestStep, onStepSelect }: StepperProps) {
  return (
    <nav aria-label="Booking steps">
      <ol className="flex items-center">
        {steps.map((label, index) => {
          const isCompleted = index < currentStep;
          const isCurrent = index === currentStep;
          const isReachable = index <= furthestStep;

          return (
            <li
              key={label}
              className={cn(
                "flex flex-1 items-center",
                index === steps.length - 1 && "flex-none"
              )}
            >
              <button
                type="button"
                disabled={!isReachable || !onStepSelect}
                onClick={() => onStepSelect?.(index)}
                aria-current={isCurrent ? "step" : undefined}
                className={cn(
                  "flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-medium transition-colors",
                  isCompleted &&
                    "border-primary bg-primary text-primary-foreground",
                  isCurrent &&
                    "border-primary bg-background text-primary",
                  !isCompleted &&
                    !isCurrent &&
                    "border-border bg-background text-muted-foreground",
                  isReachable && onStepSelect && !isCurrent && "cursor-pointer",
                  (!isReachable || !onStepSelect) && "cursor-default"
                )}
              >
                {isCompleted ? <CheckIcon className="size-3.5" /> : index + 1}
              </button>
              <span
                className={cn(
                  "ml-1.5 hidden text-xs font-medium sm:inline",
                  isCurrent ? "text-foreground" : "text-muted-foreground"
                )}
              >
                {label}
              </span>
              {index < steps.length - 1 ? (
                <span
                  className={cn(
                    "mx-2 h-px flex-1",
                    isCompleted ? "bg-primary" : "bg-border"
                  )}
                />
              ) : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export { Stepper };
