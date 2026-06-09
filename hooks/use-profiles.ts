"use client";

import { useQuery } from "@tanstack/react-query";
import { apiRequest as request } from "@/lib/api-client";
import { getClientProfileSlug } from "@/lib/profile-utils";
import { Profile } from "@/types";

type ProfilesResponse = {
  profiles: Profile[];
  activeProfile: Profile;
  activeSlug: string;
};

export function useProfiles() {
  const activeSlug = getClientProfileSlug();

  return useQuery({
    queryKey: ["profiles", activeSlug],
    queryFn: () => request<ProfilesResponse>(`/api/profiles?profile=${encodeURIComponent(activeSlug)}`),
    staleTime: 10_000,
  });
}
