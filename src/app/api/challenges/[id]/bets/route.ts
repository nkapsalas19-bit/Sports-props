import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { suggestBet } from "@/lib/challengeEngine";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const challenge = await prisma.challenge.findUnique({ where: { id: params.id } });
  if (!challenge) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (challenge.status !== "ACTIVE") {
    return NextResponse.json({ error: `challenge is ${challenge.status.toLowerCase()}, not active` }, { status: 400 });
  }

  const pending = await prisma.challengeBet.findFirst({ where: { challengeId: challenge.id, status: "PENDING" } });
  if (pending) {
    return NextResponse.json({ error: "settle the pending bet before requesting another suggestion" }, { status: 400 });
  }

  const snapshot = await prisma.marketSnapshot.findFirst({
    where: { picks: { some: {} } },
    orderBy: { scanDate: "desc" },
  });
  if (!snapshot) {
    return NextResponse.json({ error: "no scan data yet — run a scan from the dashboard first" }, { status: 400 });
  }

  const picks = await prisma.pick.findMany({
    where: { snapshotId: snapshot.id },
    orderBy: { score: "desc" },
    take: 30,
  });

  const suggestion = suggestBet(
    {
      currentBankroll: challenge.currentBankroll,
      goalBudget: challenge.goalBudget,
      targetOddsMin: challenge.targetOddsMin,
      targetOddsMax: challenge.targetOddsMax,
      maxParlayLegs: challenge.maxParlayLegs,
      stakePercent: challenge.stakePercent,
    },
    picks
  );

  if (!suggestion) {
    return NextResponse.json({ error: "no suitable picks found in today's scan for this odds range" }, { status: 400 });
  }

  const bet = await prisma.challengeBet.create({
    data: {
      challengeId: challenge.id,
      pickId: suggestion.legs.length === 1 ? suggestion.legs[0].id : undefined,
      description: suggestion.description,
      legs: suggestion.legs.length,
      americanOdds: suggestion.combinedAmericanOdds,
      stake: suggestion.stake,
      potentialPayout: suggestion.potentialPayout,
      bankrollBefore: challenge.currentBankroll,
    },
  });

  return NextResponse.json(bet, { status: 201 });
}
