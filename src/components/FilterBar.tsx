import Link from "next/link";

interface League {
  key: string;
  name: string;
}
interface Sport {
  key: string;
  name: string;
  leagues: League[];
}

function buildHref(params: Record<string, string | undefined>) {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v) search.set(k, v);
  }
  const qs = search.toString();
  return qs ? `/?${qs}` : "/";
}

function Chip({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={`px-3 py-1.5 rounded-full text-sm border transition whitespace-nowrap ${
        active
          ? "bg-emerald-500 border-emerald-500 text-black font-medium"
          : "border-white/15 text-white/70 hover:border-white/40 hover:text-white"
      }`}
    >
      {children}
    </Link>
  );
}

export function FilterBar({
  sports,
  sportKey,
  leagueKey,
  betType,
}: {
  sports: Sport[];
  sportKey?: string;
  leagueKey?: string;
  betType?: string;
}) {
  const activeSport = sports.find((s) => s.key === sportKey);

  return (
    <div className="space-y-2">
      <div className="flex gap-2 overflow-x-auto pb-1">
        <Chip href={buildHref({ betType })} active={!sportKey}>
          All Sports
        </Chip>
        {sports.map((s) => (
          <Chip key={s.key} href={buildHref({ sport: s.key, betType })} active={sportKey === s.key}>
            {s.name}
          </Chip>
        ))}
      </div>

      {activeSport && activeSport.leagues.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          <Chip href={buildHref({ sport: sportKey, betType })} active={!leagueKey}>
            All Leagues
          </Chip>
          {activeSport.leagues.map((l) => (
            <Chip key={l.key} href={buildHref({ sport: sportKey, league: l.key, betType })} active={leagueKey === l.key}>
              {l.name}
            </Chip>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <Chip href={buildHref({ sport: sportKey, league: leagueKey })} active={!betType}>
          All Bet Types
        </Chip>
        <Chip href={buildHref({ sport: sportKey, league: leagueKey, betType: "MONEYLINE" })} active={betType === "MONEYLINE"}>
          Moneylines
        </Chip>
        <Chip href={buildHref({ sport: sportKey, league: leagueKey, betType: "PROP" })} active={betType === "PROP"}>
          Player Props
        </Chip>
      </div>
    </div>
  );
}
