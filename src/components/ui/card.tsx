import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Card component - A container with consistent styling and sections
 * 
 * @example
 * <Card>
 *   <CardHeader>
 *     <CardTitle>Card Title</CardTitle>
 *     <CardDescription>Card description</CardDescription>
 *   </CardHeader>
 *   <CardContent>
 *     Content goes here
 *   </CardContent>
 *   <CardFooter>
 *     Footer content
 *   </CardFooter>
 * </Card>
 */
const Card = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "rounded-lg border shadow-xs card-hover",
      className
    )}
    style={{
      borderColor: 'var(--color-border-subtle)',
      backgroundColor: 'color-mix(in oklch, var(--color-void-raised) 80%, transparent)',
      backdropFilter: 'blur(var(--atm-blur))',
      color: 'var(--color-text-primary)',
      transition: 'border-color var(--duration-base) var(--ease-smooth), box-shadow var(--duration-base) var(--ease-smooth)'
    }}
    {...props}
  />
));
Card.displayName = "Card";

/**
 * CardHeader component - Top section of a card
 */
const CardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex flex-col space-y-1.5 p-6", className)}
    {...props}
  />
));
CardHeader.displayName = "CardHeader";

/**
 * CardTitle component - Main title within CardHeader
 */
const CardTitle = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h3
    ref={ref}
    className={cn("font-semibold leading-none tracking-tight", className)}
    style={{ fontFamily: 'var(--font-heading)' }}
    {...props}
  />
));
CardTitle.displayName = "CardTitle";

/**
 * CardDescription component - Descriptive text within CardHeader
 */
const CardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn("text-sm", className)}
    style={{ color: 'var(--color-text-secondary)' }}
    {...props}
  />
));
CardDescription.displayName = "CardDescription";

/**
 * CardContent component - Main content area of a card
 */
const CardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("p-6 pt-0", className)} {...props} />
));
CardContent.displayName = "CardContent";

/**
 * CardFooter component - Bottom section of a card
 */
const CardFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex items-center p-6 pt-0", className)}
    {...props}
  />
));
CardFooter.displayName = "CardFooter";

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent }; 