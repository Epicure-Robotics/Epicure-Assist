import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex h-5 items-center whitespace-nowrap rounded-full px-2 text-[0.6875rem] font-medium transition-colors focus:outline-hidden",
  {
    variants: {
      variant: {
        default: "text-foreground bg-secondary",
        dark: "text-primary-foreground bg-primary",
        bright: "text-accent-foreground bg-accent",
        success: "text-success-foreground bg-success",
        "success-light": "text-success bg-success/10",
        destructive: "text-destructive-foreground bg-destructive",
        gray: "text-muted-foreground bg-muted/80",
      },
      size: {
        default: "",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, size, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant, size }), className)} {...props} />;
}

export { Badge, badgeVariants };
