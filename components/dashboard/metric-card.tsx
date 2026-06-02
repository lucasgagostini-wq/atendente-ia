import { TrendUp, TrendDown, Minus, type Icon as PhosphorIcon } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { Surface } from "@/components/ui/surface";

type Trend = "up" | "down" | "neutral";

type Props = {
  title: string;
  value: string | number;
  description: string;
  icon: PhosphorIcon;
  trend?: Trend;
  trendValue?: string;
  color?: "indigo" | "emerald" | "amber" | "rose" | "violet" | "sky";
};

const colorMap = {
  indigo:  { bg: "bg-indigo-500/10",  ring: "ring-indigo-500/20",  icon: "text-indigo-400",  glow: "bg-indigo-500/5"  },
  emerald: { bg: "bg-emerald-500/10", ring: "ring-emerald-500/20", icon: "text-emerald-400", glow: "bg-emerald-500/5" },
  amber:   { bg: "bg-amber-500/10",   ring: "ring-amber-500/20",   icon: "text-amber-400",   glow: "bg-amber-500/5"   },
  rose:    { bg: "bg-rose-500/10",    ring: "ring-rose-500/20",    icon: "text-rose-400",    glow: "bg-rose-500/5"    },
  violet:  { bg: "bg-violet-500/10",  ring: "ring-violet-500/20",  icon: "text-violet-400",  glow: "bg-violet-500/5"  },
  sky:     { bg: "bg-sky-500/10",     ring: "ring-sky-500/20",     icon: "text-sky-400",     glow: "bg-sky-500/5"     },
};

const trendConfig = {
  up:      { icon: TrendUp,   className: "text-emerald-400" },
  down:    { icon: TrendDown, className: "text-rose-400" },
  neutral: { icon: Minus,     className: "text-zinc-500" },
};

export function MetricCard({ title, value, description, icon: Icon, trend = "neutral", trendValue, color = "indigo" }: Props) {
  const c = colorMap[color];
  const t = trendConfig[trend];
  const TrendIcon = t.icon;

  return (
    <Surface variant="default" padding="none" className="relative overflow-hidden transition-all duration-200 hover:border-zinc-700/60 hover:shadow-card-hover">
      {/* Background glow */}
      <div className={cn("pointer-events-none absolute -right-8 -top-8 size-28 rounded-full blur-2xl opacity-60", c.glow)} />

      <div className="p-5">
        <div className="flex items-start justify-between">
          <div className="space-y-3">
            <p className="text-[11px] font-bold uppercase tracking-widest text-zinc-600">{title}</p>
            <p className="text-3xl font-bold tracking-tight text-zinc-50">{value}</p>
          </div>
          <div className={cn("grid size-9 shrink-0 place-items-center rounded-xl ring-1", c.bg, c.ring)}>
            <Icon size={18} weight="duotone" className={cn(c.icon)} />
          </div>
        </div>
        <div className="mt-4 flex items-center justify-between">
          <p className="text-xs text-zinc-600">{description}</p>
          {trendValue && (
            <span className={cn("flex items-center gap-1 text-xs font-semibold", t.className)}>
              <TrendIcon size={12} weight="bold" />
              {trendValue}
            </span>
          )}
        </div>
      </div>
    </Surface>
  );
}
