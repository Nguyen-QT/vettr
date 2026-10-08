import { useId } from "react";

import { cn } from "cn";

interface PortalGateSectionProps
  extends Omit<React.ComponentProps<"section">, "title"> {
  title: string;
  description?: string;
}

// UI Primitive (54.4.4.2): the card frame the portal gate puts around each
// of its blocks (FindArtistForm, ClientSignInForm). Those forms leave the
// heading out on purpose, so this supplies it -- an <h2> under the page's
// <h1>, tied to the section via aria-labelledby so each block is a named
// region. useId keeps the ids unique with two sections on one page. Frame
// only: the forms keep their own <form> and intro copy.
function PortalGateSection({
  title,
  description,
  className,
  children,
  ...props
}: PortalGateSectionProps) {
  const headingId = useId();

  return (
    <section
      data-slot="portal-gate-section"
      aria-labelledby={headingId}
      className={cn(
        "flex flex-col gap-6 rounded-lg border border-border bg-card p-6 text-card-foreground shadow-sm",
        className
      )}
      {...props}
    >
      <div className="flex flex-col gap-2">
        <h2
          id={headingId}
          className="text-xl font-semibold tracking-tight text-foreground"
        >
          {title}
        </h2>
        {description ? (
          <p className="text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

export { PortalGateSection };
