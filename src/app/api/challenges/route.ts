import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { RISK_PRESETS, type RiskLevel } from "@/lib/challengeEngine";

export const dynamic = "force-dynamic";

export async function GET() {
  const challenges = await prisma.challenge.findMany({
    orderBy: { createdAt: "desc" },
    include: { bets: { orderBy: { createdAt: "desc" }, take: 1 } },
  });
  return NextResponse.json(challenges);
}

export async function POST(req: Request) {
  const body = await req.json();
  const { name, startBudget, goalBudget, riskLevel, targetOddsMin, targetOddsMax } = body as {
    name?: string;
    startBudget: number;
    goalBudget: number;
    riskLevel: RiskLevel;
    targetOddsMin?: number;
    targetOddsMax?: number;
  };

  if (!startBudget || !goalBudget || startBudget <= 0 || goalBudget <= startBudget) {
    return NextResponse.json(
      { error: "startBudget must be > 0 and goalBudget must be greater than startBudget" },
      { status: 400 }
    );
  }
  const preset = RISK_PRESETS[riskLevel] ?? RISK_PRESETS.MEDIUM;

  const challenge = await prisma.challenge.create({
    data: {
      name: name?.trim() || `$${startBudget} → $${goalBudget}`,
      startBudget,
      goalBudget,
      currentBankroll: startBudget,
      riskLevel: riskLevel ?? "MEDIUM",
      targetOddsMin: targetOddsMin ?? preset.targetOddsMin,
      targetOddsMax: targetOddsMax ?? preset.targetOddsMax,
      maxParlayLegs: preset.maxParlayLegs,
      stakePercent: preset.stakePercent,
    },
  });

  return NextResponse.json(challenge, { status: 201 });
}
