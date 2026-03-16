import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors",
  {
    variants: {
      variant: {
        default: "",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
        destructive:
          "border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80",
        outline: "text-foreground",
        gold: "",
        success: "",
        error: "",
        info: "",
        muted: "",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

const variantStyles: Record<string, React.CSSProperties> = {
  default: {
    backgroundColor: "color-mix(in oklch, var(--color-purple-500) 15%, transparent)",
    color: "var(--color-purple-400)",
    borderColor: "color-mix(in oklch, var(--color-purple-500) 20%, transparent)",
  },
  gold: {
    backgroundColor: "color-mix(in oklch, var(--color-gold-400) 12%, transparent)",
    color: "var(--color-gold-300)",
    borderColor: "color-mix(in oklch, var(--color-gold-400) 20%, transparent)",
  },
  success: {
    backgroundColor: "color-mix(in oklch, var(--color-success) 12%, transparent)",
    color: "var(--color-success)",
    borderColor: "color-mix(in oklch, var(--color-success) 20%, transparent)",
  },
  error: {
    backgroundColor: "color-mix(in oklch, var(--color-error) 12%, transparent)",
    color: "var(--color-error)",
    borderColor: "color-mix(in oklch, var(--color-error) 20%, transparent)",
  },
  info: {
    backgroundColor: "color-mix(in oklch, var(--color-info) 12%, transparent)",
    color: "var(--color-info)",
    borderColor: "color-mix(in oklch, var(--color-info) 20%, transparent)",
  },
  muted: {
    backgroundColor: "var(--color-void-overlay)",
    color: "var(--color-text-secondary)",
    borderColor: "var(--color-border-subtle)",
  },
}

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, style, ...props }: BadgeProps) {
  const resolvedVariant = variant ?? "default"
  const vStyles = variantStyles[resolvedVariant] ?? {}

  return (
    <div
      className={cn(badgeVariants({ variant }), className)}
      style={{ ...vStyles, ...style }}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
