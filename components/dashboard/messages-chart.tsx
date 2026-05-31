"use client";

import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Props = {
  series: Array<{ label: string; value: number }>;
};

export function MessagesChart({ series }: Props) {
  const max = Math.max(...series.map((item) => item.value), 1);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Volume de mensagens (7 dias)</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-7 gap-2">
          {series.map((item) => {
            const height = Math.max((item.value / max) * 140, 10);
            return (
              <div key={item.label} className="flex flex-col items-center gap-2">
                <div className="flex h-40 items-end">
                  <motion.div
                    initial={{ height: 0 }}
                    animate={{ height }}
                    transition={{ duration: 0.45, ease: "easeOut" }}
                    className="w-7 rounded-md bg-blue-500/80"
                  />
                </div>
                <span className="text-xs text-zinc-400">{item.label}</span>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

