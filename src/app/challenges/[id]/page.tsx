import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { formatAmericanOdds } from "@/lib/oddsMath";
import { BankrollChart } from "@/components/BankrollChart";
import { ChallengeActions } from "@/components/ChallengeActions";

export const dynamic = "force-dynamic";

export default async function ChallengeDetailPage({ params }: { params: { id: string } }) {
  const challenge = await prisma.challenge.findUnique({
    where: { id: params.id },
    include: { bets: { orderBy: { createdAt: "asc" } } },
  });
  if (!challenge) notFound();

  const pending = challenge.bets.find((b) => b.status === "PENDING") ?? null;
  const settled = challenge.bets.filter((b) => b.status !== "PENDING");
  const bankrollPoints = [challenge.startBudget, ...settled.map((b) => b.bankrollAfter ?? challenge.startBudget)];
  const progress = Math.min(
    100,
    Math.max(0, ((challenge.currentBankroll - challenge.startBudget) / (challenge.goalBudget - challenge.startBudget)) * 100)
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{challenge.name}</h1>
        <p className="text-white/50 text-sm mt-1">
          Risk: {challenge.riskLevel} · Target odds {formatAmericanOdds(challenge.targetOddsMin)} to{" "}
          {formatAmericanOdds(challenge.targetOddsMax)} · Up to {challenge.maxParlayLegs} leg
          {challenge.maxParlayLegs > 1 ? "s" : ""} · {Math.round(challenge.stakePercent * 100)}% of bankroll per bet
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-2 rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <div className="flex items-baseline justify-between mb-2">
            <div className="text-2xl font-bold">${challenge.currentBankroll.toFixed(2)}</div>
            <div className="text-sm text-white/50">Goal ${challenge.goalBudget.toFixed(2)}</div>
          </div>
          <div className="h-2 rounded-full bg-white/10 overflow-hidden mb-4">
            <div className="h-full bg-emerald-400" style={{ width: `${progress}%` }} />
          </div>
          <BankrollChart points={bankrollPoints} goal={challenge.goalBudget} />
        </div>

        <ChallengeActions
          challengeId={challenge.id}
          isActive={challenge.status === "ACTIVE"}
          pendingBet={
            pending
              ? {
                  id: pending.id,
                  description: pending.description,
                  americanOdds: pending.americanOdds,
                  stake: pending.stake,
                  potentialPayout: pending.potentialPayout,
                  legs: pending.legs,
                }
              : null
          }
        />
      </div>

      {challenge.status !== "ACTIVE" && (
        <div
          className={`rounded-xl border p-4 text-center font-semibold ${
            challenge.status === "WON"
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
              : "border-red-500/30 bg-red-500/10 text-red-400"
          }`}
        >
          {challenge.status === "WON" ? "Goal reached! 🎉" : "Bankroll busted."}
        </div>
      )}

      <div>
        <h2 className="font-semibold mb-3">Bet ledger</h2>
        {challenge.bets.length === 0 ? (
          <p className="text-white/40 text-sm">No bets placed yet.</p>
        ) : (
          <div className="space-y-2">
            {[...challenge.bets].reverse().map((bet) => (
              <div
                key={bet.id}
                className="rounded-lg border border-white/10 bg-white/[0.02] p-3 flex items-center justify-between gap-3 text-sm"
              >
                <div className="min-w-0">
                  <div className="truncate">{bet.description}</div>
                  <div className="text-white/40 text-xs">
                    {formatAmericanOdds(bet.americanOdds)} · Stake ${bet.stake.toFixed(2)} · Pays $
                    {bet.potentialPayout.toFixed(2)}
                  </div>
                </div>
                <span
                  className={`shrink-0 px-2 py-1 rounded-full text-xs font-medium ${
                    bet.status === "WON"
                      ? "bg-emerald-500/15 text-emerald-400"
                      : bet.status === "LOST"
                      ? "bg-red-500/15 text-red-400"
                      : bet.status === "PUSH"
                      ? "bg-white/10 text-white/60"
                      : "bg-yellow-500/15 text-yellow-400"
                  }`}
                >
                  {bet.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
