/**
 * American odds <-> implied probability helpers, plus parlay/payout math.
 */

export function impliedProbFromAmerican(odds: number): number {
  if (odds > 0) return 100 / (odds + 100);
  return -odds / (-odds + 100);
}

export function americanFromImpliedProb(prob: number): number {
  const p = Math.min(Math.max(prob, 0.0001), 0.9999);
  if (p >= 0.5) return Math.round((-p / (1 - p)) * 100);
  return Math.round(((1 - p) / p) * 100);
}

/** Decimal payout multiplier (stake included) for a single American-odds bet. */
export function decimalOdds(americanOdds: number): number {
  if (americanOdds > 0) return 1 + americanOdds / 100;
  return 1 + 100 / -americanOdds;
}

/** Combine several legs' American odds into a single parlay decimal multiplier. */
export function parlayDecimalOdds(legsAmerican: number[]): number {
  return legsAmerican.reduce((acc, odds) => acc * decimalOdds(odds), 1);
}

/** Convert a combined decimal multiplier back into American odds (for display). */
export function americanFromDecimal(decimal: number): number {
  if (decimal >= 2) return Math.round((decimal - 1) * 100);
  return Math.round(-100 / (decimal - 1));
}

/** Potential total payout (stake + winnings) for a stake at given American odds. */
export function payoutForStake(stake: number, americanOdds: number): number {
  return stake * decimalOdds(americanOdds);
}

/**
 * Fractional Kelly stake as a fraction of bankroll, clamped to [0, cap].
 * b = decimal odds - 1 (net payout per unit staked), p = modeled win probability.
 */
export function kellyFraction(modeledProb: number, americanOdds: number, fraction = 0.5, cap = 0.1): number {
  const b = decimalOdds(americanOdds) - 1;
  const p = modeledProb;
  const q = 1 - p;
  const raw = (b * p - q) / b;
  const scaled = Math.max(raw, 0) * fraction;
  return Math.min(scaled, cap);
}

export function formatAmericanOdds(odds: number): string {
  return odds > 0 ? `+${odds}` : `${odds}`;
}
