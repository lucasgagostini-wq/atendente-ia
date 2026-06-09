"use client";

import { useQuery } from "@tanstack/react-query";
import { apiRequest as request } from "@/lib/api-client";
import { Profile } from "@/types";
import { useActiveProfileSlug } from "@/hooks/use-active-profile-slug";

type ProfilesResponse = {
  profiles: Profile[];
  activeProfile: Profile;
  activeSlug: string;
};

export function useProfiles() {
  const activeSlug = useActiveProfileSlug();

  return useQuery({
    queryKey: ["profiles", activeSlug],
    queryFn: () => request<ProfilesResponse>(`/api/profiles?profile=${encodeURIComponent(activeSlug)}`),
    staleTime: 10_000,
  });
}
