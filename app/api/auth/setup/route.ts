import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const setupToken = process.env.ADMIN_SETUP_TOKEN;
    if (!setupToken) {
      return NextResponse.json(
        { error: "Setup de admin não configurado." },
        { status: 412 },
      );
    }

    const body = await request.json();
    if (body.setupToken !== setupToken) {
      return NextResponse.json(
        { error: "Token de setup inválido." },
        { status: 401 },
      );
    }

    const existingUsers = await prisma.user.count();
    if (existingUsers > 0) {
      return NextResponse.json(
        { error: "Admin já foi configurado." },
        { status: 409 },
      );
    }

    const email = String(body.email || "").trim().toLowerCase();
    const name = String(body.name || "Admin").trim();
    const password = String(body.password || "");

    if (!email || password.length < 8) {
      return NextResponse.json(
        { error: "Informe email e senha com pelo menos 8 caracteres." },
        { status: 400 },
      );
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: {
        email,
        name,
        passwordHash,
      },
      select: {
        id: true,
        email: true,
        name: true,
      },
    });

    return NextResponse.json({ user });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Falha ao configurar admin.",
        detail: error instanceof Error ? error.message : "erro desconhecido",
      },
      { status: 500 },
    );
  }
}
