import { HTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium transition-colors",
  {
    variants: {
      variant: {
        default: "border-zinc-700 bg-zinc-800 text-zinc-200",
        success: "border-emerald-700 bg-emerald-900/30 text-emerald-300",
        warning: "border-amber-700 bg-amber-900/30 text-amber-300",
        error: "border-red-700 bg-red-900/30 text-red-300",
        info: "border-blue-700 bg-blue-900/30 text-blue-300",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

type BadgeProps = HTMLAttributes<HTMLDivElement> & VariantProps<typeof badgeVariants>;

export function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}
