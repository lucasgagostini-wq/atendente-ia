/**
 * GET /api/conversations — lista conversas com paginação
 * POST /api/conversations — cria nova conversa
 */

import { ConversationStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { conversationSchema } from "@/lib/validations";
import { conversationService } from "@/services/conversation.service";
import { handleApiError } from "@/lib/api-handler";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const search = searchParams.get("search") ?? undefined;
    const status = searchParams.get("status") as ConversationStatus | null;
    const stage = searchParams.get("stage") ?? undefined;
    const limit = Math.min(Number(searchParams.get("limit") ?? "50"), 100);
    const cursor = searchParams.get("cursor") ?? undefined;

    const conversations = await conversationService.getConversations({
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
    const body = await request.json();
    const parsed = conversationSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const conversation = await conversationService.createConversation(parsed.data.leadId);
    return NextResponse.json(conversation, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
