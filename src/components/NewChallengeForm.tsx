"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { RISK_PRESETS, type RiskLevel } from "@/lib/challengeEngine";

export function NewChallengeForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [startBudget, setStartBudget] = useState(10);
  const [goalBudget, setGoalBudget] = useState(1000);
  const [riskLevel, setRiskLevel] = useState<RiskLevel>("MEDIUM");
  const preset = RISK_PRESETS[riskLevel];
  const [targetOddsMin, setTargetOddsMin] = useState(preset.targetOddsMin);
  const [targetOddsMax, setTargetOddsMax] = useState(preset.targetOddsMax);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function onRiskChange(level: RiskLevel) {
    setRiskLevel(level);
    setTargetOddsMin(RISK_PRESETS[level].targetOddsMin);
    setTargetOddsMax(RISK_PRESETS[level].targetOddsMax);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/challenges", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, startBudget, goalBudget, riskLevel, targetOddsMin, targetOddsMax }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to create challenge");
      router.push(`/challenges/${body.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create challenge");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border border-white/10 bg-white/[0.03] p-5 space-y-4">
      <h2 className="font-semibold text-lg">Start a bankroll challenge</h2>

      <div>
        <label className="block text-xs text-white/50 mb-1">Name (optional)</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="$10 to $1000"
          className="w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2 text-sm"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-white/50 mb-1">Start budget ($)</label>
          <input
            type="number"
            min={1}
            step="0.01"
            value={startBudget}
            onChange={(e) => setStartBudget(Number(e.target.value))}
            className="w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-white/50 mb-1">Goal ($)</label>
          <input
            type="number"
            min={1}
            step="0.01"
            value={goalBudget}
            onChange={(e) => setGoalBudget(Number(e.target.value))}
            className="w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs text-white/50 mb-1">Risk level</label>
        <div className="grid grid-cols-3 gap-2">
          {(["LOW", "MEDIUM", "HIGH"] as RiskLevel[]).map((level) => (
            <button
              type="button"
              key={level}
              onClick={() => onRiskChange(level)}
              className={`rounded-lg border px-3 py-2 text-sm transition ${
                riskLevel === level
                  ? "bg-emerald-500 border-emerald-500 text-black font-medium"
                  : "border-white/15 text-white/70 hover:border-white/40"
              }`}
            >
              {level.charAt(0) + level.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
        <p className="text-xs text-white/40 mt-1">
          Sets how many legs get parlayed together and how much of your bankroll rides on each bet.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-white/50 mb-1">Target odds — min</label>
          <input
            type="number"
            value={targetOddsMin}
            onChange={(e) => setTargetOddsMin(Number(e.target.value))}
            className="w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-white/50 mb-1">Target odds — max</label>
          <input
            type="number"
            value={targetOddsMax}
            onChange={(e) => setTargetOddsMax(Number(e.target.value))}
            className="w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2 text-sm"
          />
        </div>
      </div>
      <p className="text-xs text-white/40 -mt-2">
        e.g. set both to +100 to only get suggestions near even-money odds. We&apos;ll combine legs into a
        parlay when needed to land in this range.
      </p>

      {error && <p className="text-red-400 text-xs">{error}</p>}

      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black font-semibold text-sm px-4 py-2.5 transition"
      >
        {submitting ? "Creating..." : "Create challenge"}
      </button>
    </form>
  );
}
