/**
 * GET /api/conversations — lista conversas com paginação
 * POST /api/conversations — cria nova conversa
 */

import { ConversationStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { getProfileSlugFromRequest } from "@/lib/profile-context";
import { conversationSchema } from "@/lib/validations";
import { conversationService } from "@/services/conversation.service";
import { leadService } from "@/services/lead.service";
import { profileService } from "@/services/profile.service";
import { handleApiError } from "@/lib/api-handler";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const activeProfile = await profileService.getProfileBySlug(
      getProfileSlugFromRequest(request),
    );
    const { searchParams } = request.nextUrl;
    const search = searchParams.get("search") ?? undefined;
    const status = searchParams.get("status") as ConversationStatus | null;
    const stage = searchParams.get("stage") ?? undefined;
    const limit = Math.min(Number(searchParams.get("limit") ?? "50"), 100);
    const cursor = searchParams.get("cursor") ?? undefined;

    const conversations = await conversationService.getConversations({
      profileId: activeProfile.id,
      search,
      status: status ?? undefined,
      stage,
      limit,
      cursor,
    });

    return NextResponse.json(conversations);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const activeProfile = await profileService.getProfileBySlug(
      getProfileSlugFromRequest(request),
    );
    const body = await request.json();
    const parsed = conversationSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const lead = await leadService.getLeadById(parsed.data.leadId, activeProfile.id);
    if (!lead) {
      return NextResponse.json({ error: "Lead não encontrado para este perfil" }, { status: 404 });
    }

    const conversation = await conversationService.createConversation(parsed.data.leadId);
    return NextResponse.json(conversation, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
