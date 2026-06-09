import { NextResponse } from "next/server";
import { conversationSchema } from "@/lib/validations";
import { getProfileSlugFromRequest } from "@/lib/profile-context";
import { conversationService } from "@/services/conversation.service";
import { profileService } from "@/services/profile.service";

export const dynamic = "force-dynamic";

type Context = {
  params: { id: string };
};

export async function GET(_: Request, context: Context) {
  const activeProfile = await profileService.getProfileBySlug(
    getProfileSlugFromRequest(_),
  );
  const conversation = await conversationService.getConversationById(
    context.params.id,
    activeProfile.id,
  );

  if (!conversation) {
    return NextResponse.json(
      { error: "Conversa não encontrada" },
      { status: 404 },
    );
  }

  return NextResponse.json(conversation);
}

export async function PATCH(request: Request, context: Context) {
  try {
    const activeProfile = await profileService.getProfileBySlug(
      getProfileSlugFromRequest(request),
    );
    const body = await request.json();
    const parsed = conversationSchema.partial().safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const currentConversation = await conversationService.getConversationById(
      context.params.id,
      activeProfile.id,
    );

    if (!currentConversation) {
      return NextResponse.json(
        { error: "Conversa não encontrada" },
        { status: 404 },
      );
    }

    const conversation = await conversationService.updateConversation(
      context.params.id,
      {
        status: parsed.data.status,
      },
    );

    return NextResponse.json(conversation);
  } catch (error) {
    return NextResponse.json(
      {
        error: "Falha ao atualizar conversa",
        detail: error instanceof Error ? error.message : "erro desconhecido",
      },
      { status: 500 },
    );
  }
}
