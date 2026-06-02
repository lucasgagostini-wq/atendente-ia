import { cn } from "@/lib/utils";

type StatusType =
  | "active"
  | "inactive"
  | "pending"
  | "approved"
  | "changes_requested"
  | "connected"
  | "disconnected"
  | "hot"
  | "warm"
  | "cold"
  | "converted"
  | "lost";

const statusConfig: Record<StatusType, { label: string; className: string; dot: string }> = {
  active:            { label: "Ativo",             dot: "bg-emerald-400", className: "border-emerald-800/40 bg-emerald-950/50 text-emerald-400" },
  inactive:          { label: "Inativo",           dot: "bg-zinc-500",    className: "border-zinc-700/40 bg-zinc-900/50 text-zinc-500" },
  pending:           { label: "Pendente",          dot: "bg-amber-400",   className: "border-amber-800/40 bg-amber-950/50 text-amber-400" },
  approved:          { label: "Aprovado",          dot: "bg-emerald-400", className: "border-emerald-800/40 bg-emerald-950/50 text-emerald-400" },
  changes_requested: { label: "Ajuste solicitado", dot: "bg-rose-400",    className: "border-rose-800/40 bg-rose-950/50 text-rose-400" },
  connected:         { label: "Conectado",         dot: "bg-emerald-400", className: "border-emerald-800/40 bg-emerald-950/50 text-emerald-400" },
  disconnected:      { label: "Desconectado",      dot: "bg-red-400",     className: "border-red-800/40 bg-red-950/50 text-red-400" },
  hot:               { label: "Quente",            dot: "bg-orange-400",  className: "border-orange-800/40 bg-orange-950/50 text-orange-400" },
  warm:              { label: "Morno",             dot: "bg-sky-400",     className: "border-sky-800/40 bg-sky-950/50 text-sky-400" },
  cold:              { label: "Frio",              dot: "bg-zinc-400",    className: "border-zinc-700/40 bg-zinc-900/50 text-zinc-400" },
  converted:         { label: "Convertido",        dot: "bg-violet-400",  className: "border-violet-800/40 bg-violet-950/50 text-violet-400" },
  lost:              { label: "Perdido",           dot: "bg-red-400",     className: "border-red-800/40 bg-red-950/50 text-red-400" },
};

type Props = {
  status: StatusType;
  showDot?: boolean;
  className?: string;
};

export function StatusBadge({ status, showDot = true, className }: Props) {
  const config = statusConfig[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-medium tracking-wide",
        config.className,
        className,
      )}
    >
      {showDot && <span className={cn("size-1.5 rounded-full", config.dot)} />}
      {config.label}
    </span>
  );
}
