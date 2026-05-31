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
        "h-10 w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-400",
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
