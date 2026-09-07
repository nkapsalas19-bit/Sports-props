import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const challenge = await prisma.challenge.findUnique({
    where: { id: params.id },
    include: { bets: { orderBy: { createdAt: "desc" } } },
  });
  if (!challenge) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(challenge);
}
