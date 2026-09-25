import { ChevronLeftIcon } from "lucide-react";
import Link from "next/link";

import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "cn";

type BackNavCommonProps = {
  label?: string;
  className?: string;
};

type BackNavLinkProps = BackNavCommonProps & {
  href: string;
  onClick?: never;
  autoFocus?: never;
};

type BackNavButtonProps = BackNavCommonProps & {
  href?: never;
  onClick: () => void;
  autoFocus?: boolean;
};

export type BackNavProps = BackNavLinkProps | BackNavButtonProps;

// UI Primitive & Config (25.1.1): a single shared back-navigation
// control with two modes -- `href` renders a Link for page-to-page
// back navigation, `onClick` renders a button for in-page stack
// navigation (e.g. the calendar's mobile screen stack). Both share
// the same ghost-icon-button visual and ChevronLeftIcon, the one
// back-icon convention already established in the app. `label` is
// omitted for an icon-only control (falls back to "Back" for the
// accessible name); passing it also renders visible text next to the
// icon.
export function BackNav({ label, className, ...rest }: BackNavProps) {
  const accessibleLabel = label ?? "Back";
  const content = (
    <>
      <ChevronLeftIcon />
      {label ? <span>{label}</span> : null}
    </>
  );

  if ("href" in rest && rest.href !== undefined) {
    return (
      <Link
        href={rest.href}
        aria-label={accessibleLabel}
        className={cn(
          buttonVariants({ variant: "ghost", size: label ? "sm" : "icon-sm" }),
          className
        )}
      >
        {content}
      </Link>
    );
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size={label ? "sm" : "icon-sm"}
      aria-label={accessibleLabel}
      autoFocus={rest.autoFocus}
      onClick={rest.onClick}
      className={className}
    >
      {content}
    </Button>
  );
}
