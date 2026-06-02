import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const surfaceVariants = cva(
  "rounded-xl transition-all duration-200",
  {
    variants: {
      variant: {
        default:
          "border border-zinc-800/60 bg-zinc-900/60 shadow-card",
        elevated:
          "border border-zinc-700/60 bg-zinc-900/80 shadow-card-hover",
        subtle:
          "border border-zinc-800/40 bg-zinc-900/30",
        glass:
          "border border-zinc-700/30 bg-zinc-900/40 backdrop-blur-md",
        interactive:
          "border border-zinc-800/60 bg-zinc-900/60 shadow-card cursor-pointer hover:border-zinc-700/60 hover:bg-zinc-900/80 hover:shadow-card-hover active:scale-[0.99]",
        inset:
          "border border-zinc-800/40 bg-zinc-950/60",
      },
      padding: {
        none: "",
        sm:   "p-3",
        md:   "p-5",
        lg:   "p-6",
        xl:   "p-8",
      },
    },
    defaultVariants: {
      variant: "default",
      padding: "md",
    },
  },
);

export interface SurfaceProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof surfaceVariants> {}

export const Surface = React.forwardRef<HTMLDivElement, SurfaceProps>(
  ({ className, variant, padding, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(surfaceVariants({ variant, padding }), className)}
      {...props}
    />
  ),
);
Surface.displayName = "Surface";
