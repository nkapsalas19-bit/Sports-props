import { getLatestSnapshot, getPicksForSnapshot, getSportsWithLeagues } from "@/lib/queries";
import { FilterBar } from "@/components/FilterBar";
import { PickCard } from "@/components/PickCard";
import { ScanButton } from "@/components/ScanButton";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: { sport?: string; league?: string; betType?: string };
}

export default async function DashboardPage({ searchParams }: PageProps) {
  const [snapshot, sports] = await Promise.all([getLatestSnapshot(), getSportsWithLeagues()]);

  const picks = snapshot
    ? await getPicksForSnapshot(snapshot.id, {
        sportKey: searchParams.sport,
        leagueKey: searchParams.league,
        betType: searchParams.betType as "MONEYLINE" | "PROP" | undefined,
      })
    : [];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Today&apos;s Best Picks</h1>
          <p className="text-white/50 text-sm mt-1">
            {snapshot
              ? `Last scanned ${new Date(snapshot.scanDate).toLocaleString()} · ${picks.length} picks clearing the edge threshold`
              : "No scan yet — run the morning scan to pull today's lines."}
          </p>
        </div>
        <ScanButton />
      </div>

      <FilterBar
        sports={sports}
        sportKey={searchParams.sport}
        leagueKey={searchParams.league}
        betType={searchParams.betType}
      />

      {picks.length === 0 ? (
        <div className="rounded-xl border border-dashed border-white/15 p-10 text-center text-white/50">
          {snapshot
            ? "No picks match these filters. Try a different sport, league, or bet type."
            : "Run a scan to see today's highest-value moneylines and player props."}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {picks.map((pick) => (
            <PickCard key={pick.id} pick={pick} />
          ))}
        </div>
      )}
    </div>
  );
}
