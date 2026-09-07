import { formatAmericanOdds } from "@/lib/oddsMath";

export interface PickCardData {
  id: string;
  betType: string;
  side: string;
  playerName: string | null;
  propType: string | null;
  line: number | null;
  americanOdds: number;
  edge: number;
  confidence: number;
  rationale: string;
  game: {
    startTime: Date;
    league: { name: string; sport: { name: string } };
    homeTeam: { name: string; shortName: string };
    awayTeam: { name: string; shortName: string };
  };
}

function betLabel(pick: PickCardData): string {
  if (pick.betType === "MONEYLINE") {
    const team = pick.side === "HOME" ? pick.game.homeTeam : pick.game.awayTeam;
    return `${team.name} ML`;
  }
  const stat = pick.propType?.replace(/_/g, " ") ?? "";
  return `${pick.playerName} ${pick.side === "OVER" ? "Over" : "Under"} ${pick.line} ${stat}`;
}

export function PickCard({ pick }: { pick: PickCardData }) {
  const matchup = `${pick.game.awayTeam.shortName} @ ${pick.game.homeTeam.shortName}`;
  const confidencePct = Math.round(pick.confidence * 100);
  const edgePct = (pick.edge * 100).toFixed(1);

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 flex flex-col gap-3 hover:border-white/20 transition">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-xs text-white/50 uppercase tracking-wide">
            {pick.game.league.sport.name} · {pick.game.league.name}
          </div>
          <div className="text-sm text-white/60">{matchup}</div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-lg font-bold text-emerald-400">{formatAmericanOdds(pick.americanOdds)}</div>
          <div className="text-xs text-white/40">+{edgePct}% edge</div>
        </div>
      </div>

      <div className="font-semibold">{betLabel(pick)}</div>

      <div>
        <div className="flex items-center justify-between text-xs text-white/50 mb-1">
          <span>Confidence</span>
          <span>{confidencePct}%</span>
        </div>
        <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
          <div
            className="h-full bg-emerald-400"
            style={{ width: `${confidencePct}%` }}
          />
        </div>
      </div>

      <p className="text-xs text-white/50 leading-relaxed">{pick.rationale}</p>
    </div>
  );
}
