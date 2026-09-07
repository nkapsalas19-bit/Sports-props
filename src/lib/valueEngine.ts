import { impliedProbFromAmerican } from "./oddsMath";

export interface TeamHistoryInput {
  won: boolean;
  isHome: boolean;
  date: Date;
}

export interface PropHistoryInput {
  statValue: number;
  date: Date;
}

export interface ModeledResult {
  prob: number;
  confidence: number; // 0-1, driven by sample size
  sampleSize: number;
}

const GOOD_ODDS_MIN = Number(process.env.GOOD_ODDS_MIN ?? -250);
const GOOD_ODDS_MAX = Number(process.env.GOOD_ODDS_MAX ?? 250);
const MIN_EDGE = Number(process.env.MIN_EDGE ?? 0.03);
const MIN_CONFIDENCE = 0.35;

/** Recent games count more: weight = decay^(age rank), most recent game has weight 1. */
function recencyWeights(n: number, decay = 0.94): number[] {
  return Array.from({ length: n }, (_, i) => Math.pow(decay, i));
}

function weightedRate(hits: boolean[]): number {
  if (hits.length === 0) return 0.5;
  const weights = recencyWeights(hits.length);
  let num = 0;
  let den = 0;
  for (let i = 0; i < hits.length; i++) {
    num += (hits[i] ? 1 : 0) * weights[i];
    den += weights[i];
  }
  return num / den;
}

/** Combine two teams' raw win rates into P(A beats B) via the log5 method, then nudge for home court. */
export function modelMoneylineProb(
  teamLogs: TeamHistoryInput[],
  oppLogs: TeamHistoryInput[],
  isHome: boolean,
  homeEdgeBoost = 0.03
): ModeledResult {
  const sorted = (logs: TeamHistoryInput[]) => [...logs].sort((a, b) => b.date.getTime() - a.date.getTime());
  const teamRate = weightedRate(sorted(teamLogs).map((g) => g.won));
  const oppRate = weightedRate(sorted(oppLogs).map((g) => g.won));

  const pA = Math.min(Math.max(teamRate, 0.05), 0.95);
  const pB = Math.min(Math.max(oppRate, 0.05), 0.95);
  const log5 = (pA - pA * pB) / (pA + pB - 2 * pA * pB || 1);

  const prob = Math.min(Math.max(log5 + (isHome ? homeEdgeBoost : -homeEdgeBoost), 0.03), 0.97);
  const sampleSize = teamLogs.length + oppLogs.length;
  const confidence = Math.min(1, sampleSize / 40);

  return { prob, confidence, sampleSize };
}

/** Hit-rate model for a player prop: fraction of recent games clearing the line. */
export function modelPropOverProb(logs: PropHistoryInput[], line: number): ModeledResult {
  const sorted = [...logs].sort((a, b) => b.date.getTime() - a.date.getTime());
  const hits = sorted.map((g) => g.statValue > line);
  const prob = Math.min(Math.max(weightedRate(hits), 0.03), 0.97);
  const confidence = Math.min(1, sorted.length / 15);
  return { prob, confidence, sampleSize: sorted.length };
}

export interface PickCandidateInput {
  gameKey: string;
  betType: "MONEYLINE" | "PROP";
  side: "HOME" | "AWAY" | "OVER" | "UNDER";
  americanOdds: number;
  modeled: ModeledResult;
  playerKey?: string;
  playerName?: string;
  propType?: string;
  line?: number;
  contextLabel: string; // e.g. "Lakers @ Celtics" or "J. Carter points"
}

export interface RankedPick extends PickCandidateInput {
  impliedProb: number;
  edge: number;
  score: number;
  rationale: string;
  isGoodOdds: boolean;
  meetsThreshold: boolean;
}

export function evaluateCandidate(input: PickCandidateInput): RankedPick {
  const impliedProb = impliedProbFromAmerican(input.americanOdds);
  const edge = input.modeled.prob - impliedProb;
  const score = edge * input.modeled.confidence;
  const isGoodOdds = input.americanOdds >= GOOD_ODDS_MIN && input.americanOdds <= GOOD_ODDS_MAX;
  const meetsThreshold = edge >= MIN_EDGE && input.modeled.confidence >= MIN_CONFIDENCE && isGoodOdds;

  const sideLabel = input.betType === "MONEYLINE" ? (input.side === "HOME" ? "Home" : "Away") : input.side;
  const rationale =
    input.betType === "MONEYLINE"
      ? `Model gives ${sideLabel.toLowerCase()} side ${(input.modeled.prob * 100).toFixed(1)}% to win vs. ${(
          impliedProb * 100
        ).toFixed(1)}% implied by the odds (${input.modeled.sampleSize} historical games).`
      : `${input.playerName} has cleared ${input.line} ${input.propType?.replace(/_/g, " ")} in ${(
          input.modeled.prob * 100
        ).toFixed(0)}% of recent games vs. ${(impliedProb * 100).toFixed(0)}% implied (${
          input.modeled.sampleSize
        } games sampled).`;

  return { ...input, impliedProb, edge, score, rationale, isGoodOdds, meetsThreshold };
}

export function rankPicks(candidates: PickCandidateInput[]): RankedPick[] {
  return candidates
    .map(evaluateCandidate)
    .filter((p) => p.meetsThreshold)
    .sort((a, b) => b.score - a.score);
}
