import { americanFromDecimal, parlayDecimalOdds, payoutForStake } from "./oddsMath";
import type { Pick } from "@prisma/client";

export type RiskLevel = "LOW" | "MEDIUM" | "HIGH";

export interface RiskPreset {
  maxParlayLegs: number;
  stakePercent: number; // fraction of current bankroll staked per bet
  targetOddsMin: number;
  targetOddsMax: number;
}

/** Sensible defaults per risk level — the user can still override odds directly on create. */
export const RISK_PRESETS: Record<RiskLevel, RiskPreset> = {
  LOW: { maxParlayLegs: 1, stakePercent: 0.08, targetOddsMin: -300, targetOddsMax: -120 },
  MEDIUM: { maxParlayLegs: 2, stakePercent: 0.2, targetOddsMin: -120, targetOddsMax: 150 },
  HIGH: { maxParlayLegs: 4, stakePercent: 0.4, targetOddsMin: 150, targetOddsMax: 500 },
};

export interface ChallengeConfig {
  currentBankroll: number;
  goalBudget: number;
  targetOddsMin: number;
  targetOddsMax: number;
  maxParlayLegs: number;
  stakePercent: number;
}

export interface BetSuggestion {
  legs: Pick[];
  combinedAmericanOdds: number;
  stake: number;
  potentialPayout: number;
  description: string;
}

/**
 * Greedily builds a 1..maxParlayLegs combo from the best-scored available picks,
 * choosing whichever leg-count lands closest to (ideally inside) the challenge's
 * target odds range. More legs = more variance, so ties favor fewer legs.
 */
export function suggestBet(config: ChallengeConfig, availablePicks: Pick[]): BetSuggestion | null {
  if (availablePicks.length === 0) return null;

  const sorted = [...availablePicks].sort((a, b) => b.score - a.score);
  const midTarget = (config.targetOddsMin + config.targetOddsMax) / 2;

  let best: { legs: Pick[]; combinedOdds: number; distance: number } | null = null;

  for (let legCount = 1; legCount <= Math.min(config.maxParlayLegs, sorted.length); legCount++) {
    const legs = sorted.slice(0, legCount);
    const decimal = parlayDecimalOdds(legs.map((l) => l.americanOdds));
    const combinedOdds = americanFromDecimal(decimal);
    const inRange = combinedOdds >= config.targetOddsMin && combinedOdds <= config.targetOddsMax;
    const distance = inRange ? 0 : Math.min(Math.abs(combinedOdds - config.targetOddsMin), Math.abs(combinedOdds - config.targetOddsMax));

    if (!best || distance < best.distance) {
      best = { legs, combinedOdds, distance };
    }
    if (inRange) break; // first in-range, lowest leg count wins
  }

  if (!best) return null;

  const remainingToGoal = Math.max(config.goalBudget - config.currentBankroll, 0);
  const rawStake = config.currentBankroll * config.stakePercent;
  const stake = Math.max(0.5, Math.min(rawStake, config.currentBankroll, remainingToGoal > 0 ? config.currentBankroll : rawStake));
  const potentialPayout = payoutForStake(stake, best.combinedOdds);

  const description =
    best.legs.length === 1
      ? describeLeg(best.legs[0])
      : `${best.legs.length}-leg parlay: ${best.legs.map(describeLeg).join(" + ")}`;

  return {
    legs: best.legs,
    combinedAmericanOdds: best.combinedOdds,
    stake: Math.round(stake * 100) / 100,
    potentialPayout: Math.round(potentialPayout * 100) / 100,
    description,
  };
}

function describeLeg(pick: Pick): string {
  if (pick.betType === "MONEYLINE") return `${pick.side === "HOME" ? "Home" : "Away"} ML`;
  return `${pick.playerName} ${pick.side === "OVER" ? "O" : "U"}${pick.line} ${pick.propType?.replace(/_/g, " ")}`;
}

export function nextChallengeStatus(currentBankroll: number, goalBudget: number): "ACTIVE" | "WON" | "BUSTED" {
  if (currentBankroll >= goalBudget) return "WON";
  if (currentBankroll < 0.5) return "BUSTED";
  return "ACTIVE";
}
