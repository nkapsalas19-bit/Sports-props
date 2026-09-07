import { getLatestSnapshot, getProjectionsForSnapshot, getSportsWithLeagues } from "@/lib/queries";
import { FilterBar } from "@/components/FilterBar";
import { ProjectionCard } from "@/components/ProjectionCard";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: { sport?: string; league?: string };
}

export default async function TrendsPage({ searchParams }: PageProps) {
  const [snapshot, sports] = await Promise.all([getLatestSnapshot(), getSportsWithLeagues()]);

  const projections = snapshot
    ? await getProjectionsForSnapshot(snapshot.id, {
        sportKey: searchParams.sport,
        leagueKey: searchParams.league,
      })
    : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Player Trends</h1>
        <p className="text-white/50 text-sm mt-1 max-w-2xl">
          Pure stats-based projections from real recent-game history — not a sportsbook price.
          Useful when there&apos;s no live prop line to compare against yet (or as a second opinion
          alongside one). Check the actual number on your sportsbook before betting anything.
        </p>
      </div>

      <FilterBar
        sports={sports}
        sportKey={searchParams.sport}
        leagueKey={searchParams.league}
        basePath="/trends"
        showBetType={false}
      />

      {projections.length === 0 ? (
        <div className="rounded-xl border border-dashed border-white/15 p-10 text-center text-white/50">
          {snapshot
            ? "No trends match these filters, or every player here already has a live sportsbook line (see Best Picks instead)."
            : "Run a scan from the dashboard first."}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {projections.map((p) => (
            <ProjectionCard key={p.id} projection={p} />
          ))}
        </div>
      )}
    </div>
  );
}
