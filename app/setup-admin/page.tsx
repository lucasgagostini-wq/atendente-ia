import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { SetupAdminForm } from "./setup-admin-form";

export const dynamic = "force-dynamic";

export default async function SetupAdminPage() {
  const adminCount = await prisma.user.count();

  if (adminCount > 0) {
    redirect("/login");
  }

  return <SetupAdminForm />;
}
