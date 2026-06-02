"use client";

export function AnimatedDashboardBackground() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
    >
      {/* Base gradient */}
      <div className="absolute inset-0 bg-zinc-950" />

      {/* Aura 1 — top-left indigo */}
      <div className="ambient-aura-1 absolute -left-[20%] -top-[30%] h-[70vh] w-[70vw] rounded-full bg-indigo-600/[0.04] blur-[120px]" />

      {/* Aura 2 — bottom-right violet */}
      <div className="ambient-aura-2 absolute -bottom-[20%] -right-[15%] h-[60vh] w-[55vw] rounded-full bg-violet-600/[0.035] blur-[100px]" />

      {/* Aura 3 — center accent */}
      <div className="ambient-aura-3 absolute left-[30%] top-[20%] h-[40vh] w-[40vw] rounded-full bg-indigo-500/[0.025] blur-[80px]" />

      {/* Grid overlay */}
      <div
        className="absolute inset-0 opacity-[0.22]"
        style={{
          backgroundImage:
            "linear-gradient(to right, rgba(99,102,241,0.08) 1px, transparent 1px), linear-gradient(to bottom, rgba(99,102,241,0.08) 1px, transparent 1px)",
          backgroundSize: "32px 32px",
        }}
      />

      {/* Noise overlay */}
      <div
        className="absolute inset-0 opacity-[0.015]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='1'/%3E%3C/svg%3E")`,
          backgroundRepeat: "repeat",
          backgroundSize: "256px 256px",
        }}
      />
    </div>
  );
}
