import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { nextChallengeStatus } from "@/lib/challengeEngine";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request, { params }: { params: { id: string; betId: string } }) {
  const { status } = (await req.json()) as { status: "WON" | "LOST" | "PUSH" };
  if (!["WON", "LOST", "PUSH"].includes(status)) {
    return NextResponse.json({ error: "status must be WON, LOST, or PUSH" }, { status: 400 });
  }

  const bet = await prisma.challengeBet.findUnique({ where: { id: params.betId }, include: { challenge: true } });
  if (!bet || bet.challengeId !== params.id) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (bet.status !== "PENDING") return NextResponse.json({ error: "bet already settled" }, { status: 400 });

  const bankrollAfter =
    status === "WON"
      ? bet.bankrollBefore - bet.stake + bet.potentialPayout
      : status === "LOST"
      ? bet.bankrollBefore - bet.stake
      : bet.bankrollBefore;

  await prisma.challengeBet.update({
    where: { id: bet.id },
    data: { status, bankrollAfter, settledAt: new Date() },
  });

  const newStatus = nextChallengeStatus(bankrollAfter, bet.challenge.goalBudget);
  const challenge = await prisma.challenge.update({
    where: { id: bet.challengeId },
    data: { currentBankroll: bankrollAfter, status: newStatus },
  });

  return NextResponse.json(challenge);
}
