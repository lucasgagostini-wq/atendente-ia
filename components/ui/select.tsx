import { SelectHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type Option = {
  label: string;
  value: string;
};

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  options: Option[];
};

export function Select({ className, options, ...props }: SelectProps) {
  return (
    <select
      className={cn(
        "h-9 w-full cursor-pointer rounded-lg border border-zinc-700/80 bg-zinc-900/80 px-3 text-sm text-zinc-100 transition-colors",
        "hover:border-zinc-600",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40 focus-visible:border-indigo-500/50",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
