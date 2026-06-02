import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg text-sm font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50 focus-visible:ring-offset-1 focus-visible:ring-offset-zinc-950 disabled:pointer-events-none disabled:opacity-40 active:scale-[0.97]",
  {
    variants: {
      variant: {
        default:
          "bg-zinc-100 text-zinc-900 shadow-sm hover:bg-white hover:shadow-md",
        outline:
          "border border-zinc-700/80 bg-zinc-900/80 text-zinc-300 hover:bg-zinc-800 hover:border-zinc-600 hover:text-zinc-100",
        secondary:
          "bg-indigo-600 text-white shadow-sm hover:bg-indigo-500 shadow-indigo-900/30",
        ghost:
          "text-zinc-400 hover:bg-zinc-800/80 hover:text-zinc-100",
        destructive:
          "bg-red-600/90 text-white hover:bg-red-500 shadow-sm shadow-red-900/30",
        success:
          "bg-emerald-600/90 text-white hover:bg-emerald-500 shadow-sm shadow-emerald-900/30",
        link:
          "text-indigo-400 underline-offset-4 hover:underline hover:text-indigo-300 p-0 h-auto",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm:      "h-7 rounded-md px-3 text-xs",
        lg:      "h-11 rounded-lg px-6 text-base",
        icon:    "h-8 w-8 rounded-lg",
        "icon-sm": "h-7 w-7 rounded-md",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button
      className={cn(buttonVariants({ variant, size, className }))}
      ref={ref}
      {...props}
    />
  ),
);
Button.displayName = "Button";

export { Button, buttonVariants };
