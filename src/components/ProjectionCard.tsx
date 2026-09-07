export interface ProjectionCardData {
  id: string;
  playerName: string;
  propType: string;
  projectedLine: number;
  recentAvg: number;
  hitRate: number;
  sampleSize: number;
  vsOpponentAvg: number | null;
  vsOpponentGames: number | null;
  rationale: string;
  game: {
    league: { name: string; sport: { name: string } };
    homeTeam: { shortName: string };
    awayTeam: { shortName: string };
  };
}

export function ProjectionCard({ projection }: { projection: ProjectionCardData }) {
  const matchup = `${projection.game.awayTeam.shortName} @ ${projection.game.homeTeam.shortName}`;
  const hitPct = Math.round(projection.hitRate * 100);
  const statLabel = projection.propType.replace(/_/g, " ");

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 flex flex-col gap-3 hover:border-white/20 transition">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-xs text-white/50 uppercase tracking-wide">
            {projection.game.league.sport.name} · {projection.game.league.name}
          </div>
          <div className="text-sm text-white/60">{matchup}</div>
        </div>
        <span className="shrink-0 rounded-full bg-amber-500/15 text-amber-400 text-[10px] font-semibold uppercase tracking-wide px-2 py-1">
          Projection
        </span>
      </div>

      <div>
        <div className="font-semibold">{projection.playerName}</div>
        <div className="text-sm text-white/60 capitalize">{statLabel}</div>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg bg-black/20 py-2">
          <div className="text-lg font-bold text-emerald-400">{projection.recentAvg.toFixed(1)}</div>
          <div className="text-[10px] text-white/40 uppercase">Recent avg</div>
        </div>
        <div className="rounded-lg bg-black/20 py-2">
          <div className="text-lg font-bold">{projection.projectedLine}</div>
          <div className="text-[10px] text-white/40 uppercase">Our line</div>
        </div>
        <div className="rounded-lg bg-black/20 py-2">
          <div className="text-lg font-bold">{hitPct}%</div>
          <div className="text-[10px] text-white/40 uppercase">Hit rate</div>
        </div>
      </div>

      <p className="text-xs text-white/50 leading-relaxed">{projection.rationale}</p>
    </div>
  );
}
