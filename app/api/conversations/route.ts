import { ConversationStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { conversationSchema } from "@/lib/validations";
import { conversationService } from "@/services/conversation.service";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const search = request.nextUrl.searchParams.get("search") ?? undefined;
  const status = request.nextUrl.searchParams.get(
    "status",
  ) as ConversationStatus | null;
  const stage = request.nextUrl.searchParams.get("stage") ?? undefined;

  const conversations = await conversationService.getConversations({
    search,
    status: status ?? undefined,
    stage,
  });

  return NextResponse.json(conversations);
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = conversationSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const conversation = await conversationService.createConversation(
      parsed.data.leadId,
    );
    return NextResponse.json(conversation, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Falha ao criar conversa",
        detail: error instanceof Error ? error.message : "erro desconhecido",
      },
      { status: 500 },
    );
  }
}
