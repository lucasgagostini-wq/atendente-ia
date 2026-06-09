import { NextResponse } from "next/server";
import { getProfileSlugFromRequest } from "@/lib/profile-context";
import { evolutionService } from "@/services/evolution.service";
import { profileService } from "@/services/profile.service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const activeProfile = await profileService.getProfileBySlug(
    getProfileSlugFromRequest(request),
  );

  if (activeProfile.status === "AWAITING_WHATSAPP") {
    return NextResponse.json({
      connected: false,
      configured: false,
      number: activeProfile.whatsappNumber,
      profileStatus: activeProfile.status,
      reason: "profile_awaiting_whatsapp",
    });
  }

  const status = await evolutionService.getStatus();
  return NextResponse.json({
    ...status,
    number: activeProfile.whatsappNumber || status.number || null,
    profileStatus: activeProfile.status,
  });
}
