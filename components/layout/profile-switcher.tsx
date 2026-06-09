"use client";

import { useEffect, useMemo, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Stack, Storefront } from "@phosphor-icons/react";
import { ACTIVE_PROFILE_COOKIE, getClientProfileSlug } from "@/lib/profile-utils";
import { useProfiles } from "@/hooks/use-profiles";
import { Select } from "@/components/ui/select";
import { useAppStore } from "@/store/app-store";

function buildCookie(slug: string) {
  return `${ACTIVE_PROFILE_COOKIE}=${encodeURIComponent(slug)}; path=/; max-age=31536000; samesite=lax`;
}

export function ProfileSwitcher() {
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const { data, isLoading } = useProfiles();
  const lastAppliedSlugRef = useRef<string | null>(null);

  const activeSlug = getClientProfileSlug() ?? data?.activeSlug ?? "restauracao-fotos";
  const profileOptions = useMemo(
    () =>
      (data?.profiles ?? []).map((profile) => ({
        label: profile.name,
        value: profile.slug,
      })),
    [data?.profiles],
  );

  useEffect(() => {
    if (!data?.activeSlug || (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("profile"))) return;

    const nextParams = new URLSearchParams(
      typeof window !== "undefined" ? window.location.search : "",
    );
    nextParams.set("profile", data.activeSlug);
    router.replace(`${pathname}?${nextParams.toString()}`, { scroll: false });
  }, [data?.activeSlug, pathname, router]);

  useEffect(() => {
    if (!activeSlug || lastAppliedSlugRef.current === activeSlug) return;

    lastAppliedSlugRef.current = activeSlug;
    document.cookie = buildCookie(activeSlug);
    useAppStore.getState().setSelectedConversationId(null);

    queryClient.invalidateQueries({
      predicate: (query) => String(query.queryKey[0] ?? "") !== "profiles",
    }).catch(() => {});
  }, [activeSlug, queryClient]);

  function handleChange(nextSlug: string) {
    const nextParams = new URLSearchParams(
      typeof window !== "undefined" ? window.location.search : "",
    );
    nextParams.set("profile", nextSlug);
    router.push(`${pathname}?${nextParams.toString()}`, { scroll: false });
  }

  return (
    <div className="flex min-w-[220px] items-center gap-2 rounded-lg border border-zinc-800/60 bg-zinc-900/50 px-2.5 py-1.5">
      <div className="grid size-7 shrink-0 place-items-center rounded-md bg-indigo-500/10 text-indigo-300 ring-1 ring-indigo-500/15">
        <Storefront size={14} weight="duotone" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-center gap-1 text-[10px] uppercase tracking-widest text-zinc-600">
          <Stack size={10} weight="duotone" />
          Perfil ativo
        </div>
        <Select
          className="h-8 border-zinc-800 bg-zinc-950/70 px-2 text-xs"
          options={profileOptions.length ? profileOptions : [{ label: "Carregando perfis...", value: activeSlug }]}
          value={activeSlug}
          onChange={(event) => handleChange(event.target.value)}
          disabled={isLoading || profileOptions.length === 0}
          aria-label="Selecionar perfil ativo"
        />
      </div>
    </div>
  );
}
