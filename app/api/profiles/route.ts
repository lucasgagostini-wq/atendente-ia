import { NextRequest, NextResponse } from "next/server";
import { getProfileSlugFromRequest } from "@/lib/profile-context";
import { profileService } from "@/services/profile.service";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const profileSlug = getProfileSlugFromRequest(request);
  const { profiles, activeProfile, activeSlug } = await profileService.resolveProfile(profileSlug);

  return NextResponse.json({
    profiles,
    activeProfile,
    activeSlug,
  });
}
