import Link from "next/link";
import { prisma } from "@/lib/db";
import { NewChallengeForm } from "@/components/NewChallengeForm";

export const dynamic = "force-dynamic";

function statusColor(status: string) {
  if (status === "WON") return "text-emerald-400";
  if (status === "BUSTED") return "text-red-400";
  return "text-white/60";
}

export default async function ChallengesPage() {
  const challenges = await prisma.challenge.findMany({ orderBy: { createdAt: "desc" } });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-4">
        <h1 className="text-2xl font-bold">Bankroll Challenges</h1>
        {challenges.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/15 p-10 text-center text-white/50">
            No challenges yet. Create one to get bet suggestions sized to hit your goal.
          </div>
        ) : (
          <div className="space-y-3">
            {challenges.map((c) => {
              const progress = Math.min(100, Math.max(0, ((c.currentBankroll - c.startBudget) / (c.goalBudget - c.startBudget)) * 100));
              return (
                <Link
                  key={c.id}
                  href={`/challenges/${c.id}`}
                  className="block rounded-xl border border-white/10 bg-white/[0.03] hover:border-white/20 p-4 transition"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="font-semibold">{c.name}</div>
                    <div className={`text-sm font-medium ${statusColor(c.status)}`}>{c.status}</div>
                  </div>
                  <div className="flex items-center justify-between text-xs text-white/50 mb-1">
                    <span>${c.currentBankroll.toFixed(2)}</span>
                    <span>Goal ${c.goalBudget.toFixed(2)}</span>
                  </div>
                  <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                    <div className="h-full bg-emerald-400" style={{ width: `${progress}%` }} />
                  </div>
                  <div className="text-xs text-white/40 mt-2">
                    Risk: {c.riskLevel} · Target odds {c.targetOddsMin > 0 ? "+" : ""}
                    {c.targetOddsMin} to {c.targetOddsMax > 0 ? "+" : ""}
                    {c.targetOddsMax}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      <div>
        <NewChallengeForm />
      </div>
    </div>
  );
}
