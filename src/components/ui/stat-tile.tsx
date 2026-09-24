import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"

const statTileValueVariants = cva("text-2xl font-semibold", {
  variants: {
    tone: {
      default: "text-foreground",
      accent: "text-primary",
      warning: "text-chart-4",
    },
  },
  defaultVariants: {
    tone: "default",
  },
})

interface StatTileProps
  extends React.ComponentProps<"div">,
    VariantProps<typeof statTileValueVariants> {
  label: string
  value: string | number
}

function StatTile({ label, value, tone, className, ...props }: StatTileProps) {
  return (
    <div
      data-slot="stat-tile"
      className={cn(
        "flex flex-col gap-1 rounded-lg border border-border bg-card p-4 text-card-foreground",
        className
      )}
      {...props}
    >
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className={cn(statTileValueVariants({ tone }))}>{value}</span>
    </div>
  )
}

export { StatTile }
