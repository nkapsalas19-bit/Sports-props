import type { DailyMarketData, TeamGameLogEntry } from "../providers/types";

/**
 * Team-history enrichment via the api-sports.io family (https://api-sports.io):
 *   - api-football   (soccer)              — https://v3.football.api-sports.io
 *   - api-basketball (NBA)                 — https://v1.basketball.api-sports.io
 *   - api-american-football (NFL)          — https://v1.american-football.api-sports.io
 *   - api-baseball   (MLB)                 — https://v1.baseball.api-sports.io
 * All four take the same `x-apisports-key` header and wrap results in `{ response: [...] }`.
 *
 * CONFIDENCE NOTE: the soccer (api-football) mapping below matches that API's well-documented,
 * long-stable v3 shape closely. The basketball/NFL/baseball sibling APIs follow the same general
 * conventions (leagues -> teams -> games, `last=N` for recent games) but their exact field names
 * for scores/winners are mapped defensively with fallbacks here rather than verified live (no
 * network access to api-sports.io from the environment this was built in). If a league comes back
 * empty, open that sport's dashboard at api-sports.io once you have a key — it shows a live
 * example request/response for your exact plan — and adjust `mapGameToLog` below to match.
 *
 * SCOPE: this only backfills TEAM history (TeamGameLog), which is what the moneyline model needs.
 * Player prop history isn't fetched here — The Odds API doesn't return player props on the free
 * tier this app defaults to, so there's nothing to model props against yet. Once props are wired
 * up, extend this file with a player-game-log fetch (api-football's `/fixtures/players?fixture=`
 * is the equivalent endpoint for soccer).
 */

interface SportApiConfig {
  base: string;
  style: "fixtures" | "games";
}

const SPORT_API: Record<string, SportApiConfig> = {
  soccer: { base: "https://v3.football.api-sports.io", style: "fixtures" },
  basketball: { base: "https://v1.basketball.api-sports.io", style: "games" },
  football: { base: "https://v1.american-football.api-sports.io", style: "games" }, // NFL
  baseball: { base: "https://v1.baseball.api-sports.io", style: "games" },
};

interface ApiSportsEnvelope<T> {
  response: T[];
  errors?: unknown;
}

async function apiGet<T>(base: string, path: string, params: Record<string, string>, apiKey: string): Promise<T[]> {
  const url = new URL(base + path);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  let res: Response;
  try {
    res = await fetch(url.toString(), { headers: { "x-apisports-key": apiKey } });
  } catch (err) {
    console.warn(`[api-sports] ${path} request failed: ${err instanceof Error ? err.message : err}`);
    return [];
  }
  if (!res.ok) {
    console.warn(`[api-sports] ${path} HTTP ${res.status}`);
    return [];
  }
  const body = (await res.json()) as ApiSportsEnvelope<T>;
  if (body.errors && Array.isArray(body.errors) ? body.errors.length : Object.keys(body.errors ?? {}).length) {
    console.warn(`[api-sports] ${path} returned errors:`, body.errors);
  }
  return body.response ?? [];
}

/** Deep-get the first defined value across several possible field paths (for API-shape uncertainty). */
function firstOf(obj: unknown, paths: string[][]): unknown {
  for (const path of paths) {
    let cur: unknown = obj;
    for (const key of path) {
      if (cur == null || typeof cur !== "object") {
        cur = undefined;
        break;
      }
      cur = (cur as Record<string, unknown>)[key];
    }
    if (cur !== undefined) return cur;
  }
  return undefined;
}

interface LeagueSeason {
  leagueId: number;
  season: string | number;
}

export class ApiSportsStatsEnricher {
  private apiKey: string;
  private leagueCache = new Map<string, LeagueSeason | null>();
  private teamIdCache = new Map<string, number | null>();

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async enrich(data: DailyMarketData): Promise<DailyMarketData> {
    const teamGameLogs: TeamGameLogEntry[] = [...data.teamGameLogs];

    // Group teams by league so we resolve each league/season once.
    const teamsByLeague = new Map<string, Set<string>>();
    for (const team of data.teams) {
      const set = teamsByLeague.get(team.leagueKey) ?? new Set<string>();
      set.add(team.key);
      teamsByLeague.set(team.leagueKey, set);
    }
    const teamNameByKey = new Map(data.teams.map((t) => [t.key, t.name]));

    for (const league of data.leagues) {
      const config = SPORT_API[league.sportKey];
      const teamKeys = teamsByLeague.get(league.key);
      if (!config || !teamKeys?.size) continue;

      const leagueSeason = await this.resolveLeagueSeason(config, league.name);
      if (!leagueSeason) {
        console.warn(`[api-sports] could not resolve league "${league.name}" (${league.sportKey}) — skipping history`);
        continue;
      }

      for (const teamKey of teamKeys) {
        const teamName = teamNameByKey.get(teamKey);
        if (!teamName) continue;

        const teamId = await this.resolveTeamId(config, leagueSeason, teamName);
        if (teamId == null) {
          console.warn(`[api-sports] could not resolve team "${teamName}" in "${league.name}" — skipping history`);
          continue;
        }

        const logs = await this.fetchTeamHistory(config, leagueSeason, teamId, teamKey);
        teamGameLogs.push(...logs);
      }
    }

    return { ...data, teamGameLogs };
  }

  private async resolveLeagueSeason(config: SportApiConfig, leagueName: string): Promise<LeagueSeason | null> {
    const cacheKey = `${config.base}:${leagueName}`;
    if (this.leagueCache.has(cacheKey)) return this.leagueCache.get(cacheKey) ?? null;

    const results = await apiGet<Record<string, unknown>>(config.base, "/leagues", { name: leagueName }, this.apiKey);
    const first = results[0];
    if (!first) {
      this.leagueCache.set(cacheKey, null);
      return null;
    }

    const leagueId = Number(firstOf(first, [["league", "id"], ["id"]]));
    const seasons = firstOf(first, [["seasons"]]) as Array<Record<string, unknown>> | undefined;
    let season: string | number | undefined;
    if (Array.isArray(seasons) && seasons.length) {
      const current = seasons.find((s) => s.current === true);
      const chosen = current ?? seasons[seasons.length - 1];
      season = (chosen.year as string | number | undefined) ?? (chosen.season as string | number | undefined);
    }

    if (!leagueId || season === undefined) {
      this.leagueCache.set(cacheKey, null);
      return null;
    }
    const result = { leagueId, season };
    this.leagueCache.set(cacheKey, result);
    return result;
  }

  private async resolveTeamId(config: SportApiConfig, ls: LeagueSeason, teamName: string): Promise<number | null> {
    const cacheKey = `${config.base}:${ls.leagueId}:${teamName}`;
    if (this.teamIdCache.has(cacheKey)) return this.teamIdCache.get(cacheKey) ?? null;

    const results = await apiGet<Record<string, unknown>>(
      config.base,
      "/teams",
      { league: String(ls.leagueId), season: String(ls.season), search: teamName },
      this.apiKey
    );
    const first = results[0];
    const id = first ? Number(firstOf(first, [["team", "id"], ["id"]])) : NaN;
    const resolved = Number.isFinite(id) ? id : null;
    this.teamIdCache.set(cacheKey, resolved);
    return resolved;
  }

  private async fetchTeamHistory(
    config: SportApiConfig,
    ls: LeagueSeason,
    teamId: number,
    teamKey: string
  ): Promise<TeamGameLogEntry[]> {
    const path = config.style === "fixtures" ? "/fixtures" : "/games";
    const raw = await apiGet<Record<string, unknown>>(
      config.base,
      path,
      { team: String(teamId), season: String(ls.season), last: "15" },
      this.apiKey
    );

    return raw
      .map((g) => this.mapGameToLog(g, teamId, teamKey))
      .filter((g): g is TeamGameLogEntry => g !== null);
  }

  private mapGameToLog(g: Record<string, unknown>, teamId: number, teamKey: string): TeamGameLogEntry | null {
    const homeTeam = firstOf(g, [["teams", "home"]]) as Record<string, unknown> | undefined;
    const awayTeam = firstOf(g, [["teams", "away"]]) as Record<string, unknown> | undefined;
    if (!homeTeam || !awayTeam) return null;

    const homeId = Number(homeTeam.id);
    const awayId = Number(awayTeam.id);
    const isHome = homeId === teamId;
    if (!isHome && awayId !== teamId) return null;

    const dateRaw = firstOf(g, [["fixture", "date"], ["date"], ["game", "date"]]);
    const date = dateRaw ? new Date(String(dateRaw)) : null;
    if (!date || Number.isNaN(date.getTime())) return null;

    // Scores: soccer nests under `goals.home/away`; the games-style siblings typically nest under
    // `scores.home.total`/`scores.away.total`. Try both, plus a couple of likely NFL variants.
    const homeScore = Number(
      firstOf(g, [["goals", "home"], ["scores", "home", "total"], ["scores", "home"], ["score", "home"]])
    );
    const awayScore = Number(
      firstOf(g, [["goals", "away"], ["scores", "away", "total"], ["scores", "away"], ["score", "away"]])
    );
    if (!Number.isFinite(homeScore) || !Number.isFinite(awayScore)) return null;

    const pointsFor = isHome ? homeScore : awayScore;
    const pointsAgainst = isHome ? awayScore : homeScore;

    // Prefer an explicit winner flag when the API provides one (soccer does); otherwise derive
    // from the score. Ties (soccer draws) resolve to `won: false` — the model treats a draw as a
    // non-win, which is directionally fine for a moneyline (2-outcome) approximation.
    const explicitWinner = firstOf(g, [
      isHome ? ["teams", "home", "winner"] : ["teams", "away", "winner"],
    ]);
    const won = typeof explicitWinner === "boolean" ? explicitWinner : pointsFor > pointsAgainst;

    const opponentName = String((isHome ? awayTeam.name : homeTeam.name) ?? "Unknown");

    return {
      teamKey,
      date,
      opponent: opponentName,
      isHome,
      won,
      pointsFor,
      pointsAgainst,
    };
  }
}
