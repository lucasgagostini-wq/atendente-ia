import { HTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium tracking-wide transition-colors",
  {
    variants: {
      variant: {
        default:  "border-zinc-700/60 bg-zinc-800/80 text-zinc-300",
        success:  "border-emerald-700/40 bg-emerald-950/60 text-emerald-400",
        warning:  "border-amber-700/40 bg-amber-950/60 text-amber-400",
        error:    "border-red-700/40 bg-red-950/60 text-red-400",
        info:     "border-indigo-700/40 bg-indigo-950/60 text-indigo-400",
        purple:   "border-purple-700/40 bg-purple-950/60 text-purple-400",
        ghost:    "border-transparent bg-transparent text-zinc-500",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

type BadgeProps = HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>;

export function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}
