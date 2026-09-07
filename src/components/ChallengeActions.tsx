"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatAmericanOdds } from "@/lib/oddsMath";

interface PendingBet {
  id: string;
  description: string;
  americanOdds: number;
  stake: number;
  potentialPayout: number;
  legs: number;
}

export function ChallengeActions({
  challengeId,
  pendingBet,
  isActive,
}: {
  challengeId: string;
  pendingBet: PendingBet | null;
  isActive: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function requestSuggestion() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/challenges/${challengeId}/bets`, { method: "POST" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to get a suggestion");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to get a suggestion");
    } finally {
      setLoading(false);
    }
  }

  async function settle(status: "WON" | "LOST" | "PUSH") {
    if (!pendingBet) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/challenges/${challengeId}/bets/${pendingBet.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to settle bet");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to settle bet");
    } finally {
      setLoading(false);
    }
  }

  if (!isActive) {
    return null;
  }

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 space-y-3">
      {pendingBet ? (
        <>
          <div className="text-xs text-white/50 uppercase tracking-wide">Pending bet</div>
          <div className="font-semibold">{pendingBet.description}</div>
          <div className="text-sm text-white/60">
            {pendingBet.legs > 1 ? `${pendingBet.legs} legs · ` : ""}
            {formatAmericanOdds(pendingBet.americanOdds)} · Stake ${pendingBet.stake.toFixed(2)} · Pays $
            {pendingBet.potentialPayout.toFixed(2)}
          </div>
          <div className="flex gap-2 pt-1">
            <button
              onClick={() => settle("WON")}
              disabled={loading}
              className="flex-1 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black font-semibold text-sm px-3 py-2 transition"
            >
              Won
            </button>
            <button
              onClick={() => settle("LOST")}
              disabled={loading}
              className="flex-1 rounded-lg bg-red-500/90 hover:bg-red-500 disabled:opacity-50 text-black font-semibold text-sm px-3 py-2 transition"
            >
              Lost
            </button>
            <button
              onClick={() => settle("PUSH")}
              disabled={loading}
              className="flex-1 rounded-lg border border-white/20 hover:border-white/40 disabled:opacity-50 text-sm px-3 py-2 transition"
            >
              Push
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="text-sm text-white/60">No pending bet. Get a suggestion sized to your risk settings.</div>
          <button
            onClick={requestSuggestion}
            disabled={loading}
            className="w-full rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black font-semibold text-sm px-4 py-2.5 transition"
          >
            {loading ? "Thinking..." : "Suggest next bet"}
          </button>
        </>
      )}
      {error && <p className="text-red-400 text-xs">{error}</p>}
    </div>
  );
}
