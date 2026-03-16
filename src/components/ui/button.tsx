import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * Button variants configuration using class-variance-authority
 */
const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default:
          "shadow hover:opacity-90",
        destructive:
          "shadow-xs hover:opacity-90",
        outline:
          "border bg-transparent shadow-xs hover:opacity-80",
        secondary:
          "border bg-transparent shadow-xs hover:opacity-80",
        ghost: "hover:opacity-80",
        accent: "border bg-transparent hover:opacity-80",
        link: "underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 rounded-md px-3 text-xs",
        lg: "h-10 rounded-md px-8",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

/**
 * Inline style overrides per variant, using CSS custom properties (OKLCH)
 * that Tailwind cannot resolve at build time.
 */
const variantStyles: Record<string, React.CSSProperties> = {
  default: {
    backgroundColor: 'var(--color-purple-500)',
    color: 'var(--color-text-on-purple)',
    boxShadow: '0 0 15px var(--color-purple-glow)',
  },
  destructive: {
    backgroundColor: 'var(--color-error)',
    color: 'white',
  },
  outline: {
    borderColor: 'var(--color-border-subtle)',
    color: 'var(--color-text-primary)',
  },
  secondary: {
    backgroundColor: 'transparent',
    color: 'var(--color-text-primary)',
    borderColor: 'var(--color-border-subtle)',
  },
  ghost: {
    backgroundColor: 'transparent',
    color: 'var(--color-text-secondary)',
  },
  accent: {
    backgroundColor: 'transparent',
    color: 'var(--color-gold-400)',
    borderColor: 'var(--color-border-gold)',
  },
  link: {
    color: 'var(--color-purple-400)',
  },
};

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

/**
 * Button component with multiple variants and sizes
 *
 * @example
 * <Button variant="outline" size="lg" onClick={() => console.log('clicked')}>
 *   Click me
 * </Button>
 */
const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, style, ...props }, ref) => {
    const resolvedVariant = variant ?? 'default';
    return (
      <button
        className={cn(buttonVariants({ variant: resolvedVariant, size, className }))}
        ref={ref}
        style={{ ...variantStyles[resolvedVariant], ...style }}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
