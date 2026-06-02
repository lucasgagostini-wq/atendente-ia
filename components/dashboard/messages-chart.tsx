"use client";

import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Props = {
  series: Array<{ label: string; value: number }>;
};

export function MessagesChart({ series }: Props) {
  const max = Math.max(...series.map((s) => s.value), 1);
  const total = series.reduce((sum, s) => sum + s.value, 0);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-4">
        <div>
          <CardTitle className="text-sm font-semibold text-zinc-200">Volume de mensagens</CardTitle>
          <p className="mt-0.5 text-xs text-zinc-500">Últimos 7 dias</p>
        </div>
        <div className="text-right">
          <p className="text-xl font-semibold text-zinc-100">{total}</p>
          <p className="text-[11px] text-zinc-500">total no período</p>
        </div>
      </CardHeader>

      <CardContent className="pb-5">
        <div className="flex items-end gap-2" style={{ height: 120 }}>
          {series.map((item, i) => {
            const heightPct = max > 0 ? (item.value / max) * 100 : 0;
            const isLast = i === series.length - 1;
            return (
              <div key={item.label} className="group flex flex-1 flex-col items-center gap-2">
                {/* Tooltip */}
                <div className="relative flex flex-col items-center">
                  <div
                    className="pointer-events-none absolute -top-8 hidden rounded-md border border-zinc-700/80 bg-zinc-900 px-2 py-1 text-xs text-zinc-200 shadow-lg group-hover:block"
                    style={{ whiteSpace: "nowrap" }}
                  >
                    {item.value}
                  </div>
                </div>

                {/* Bar */}
                <div className="flex w-full flex-1 items-end">
                  <motion.div
                    initial={{ scaleY: 0 }}
                    animate={{ scaleY: 1 }}
                    transition={{ duration: 0.5, delay: i * 0.05, ease: [0.4, 0, 0.2, 1] }}
                    style={{ height: `${Math.max(heightPct, 4)}%`, transformOrigin: "bottom" }}
                    className={`w-full rounded-t-md ${
                      isLast
                        ? "bg-indigo-500"
                        : "bg-zinc-700/80 group-hover:bg-zinc-600"
                    } transition-colors`}
                  />
                </div>

                <span className={`text-[11px] font-medium ${isLast ? "text-indigo-400" : "text-zinc-500"}`}>
                  {item.label}
                </span>
              </div>
            );
          })}
        </div>

        {/* Y-axis hint */}
        <div className="mt-3 border-t border-zinc-800/60 pt-2 text-right">
          <p className="text-[10px] text-zinc-600">pico: {max} msg/dia</p>
        </div>
      </CardContent>
    </Card>
  );
}
