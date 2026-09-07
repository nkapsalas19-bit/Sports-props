import { CATALOG } from "../providers/catalog";
import type { DailyMarketData, PlayerDef, PlayerGameLogEntry, TeamGameLogEntry } from "../providers/types";

/**
 * Real-history enrichment via the api-sports.io family (https://api-sports.io):
 *   - api-football   (soccer)              — https://v3.football.api-sports.io
 *   - api-basketball (NBA)                 — https://v1.basketball.api-sports.io
 *   - api-american-football (NFL)          — https://v1.american-football.api-sports.io
 *   - api-baseball   (MLB)                 — https://v1.baseball.api-sports.io
 * All four take the same `x-apisports-key` header and wrap results in `{ response: [...] }`.
 *
 * CONFIDENCE NOTE: the soccer (api-football) mapping matches that API's well-documented,
 * long-stable v3 shape closely, including the per-fixture player stats endpoint. The
 * basketball/NFL/baseball sibling APIs follow the same general conventions (leagues -> teams ->
 * games -> per-game player stats) but their exact field names are mapped defensively with
 * fallbacks here rather than verified live (no network access to api-sports.io from the
 * environment this was built in). If a sport comes back empty or thin, open that sport's page on
 * your api-sports dashboard once you have a key — it shows a live example response for your plan
 * — and adjust `STAT_FIELD_PATHS` / `mapGameToLog` below to match.
 *
 * WHY THIS EXISTS WITHOUT REAL SPORTSBOOK PROP LINES: a player's recent performance and
 * matchup history is public data, independent of whether we have a live book price to bet
 * against. This backfills real TeamGameLog (for the moneyline model) and real PlayerGameLog
 * (for a pure stats-based projection — see src/lib/projections.ts) so both work even before a
 * paid odds-with-props plan is in the picture. A `PlayerProjection` is NEVER a sportsbook price —
 * it's this app's own reference point from recent form, always labeled as such in the UI.
 *
 * RATE LIMITS: free api-sports plans cap out around 100 requests/day. Pulling full history for
 * every team/player across 10 leagues every morning would blow through that in one scan, so every
 * call here is metered against `API_SPORTS_MAX_CALLS` (default 90) — once spent, remaining
 * leagues/teams are skipped for that scan with a warning instead of erroring out or overrunning
 * your quota. Player-log depth is also capped smaller than team-log depth for the same reason.
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

/** Field paths (relative to one player's stat entry) per sport+propType. Soccer is high-confidence
 *  (api-football's `/fixtures/players` shape); the rest are best-effort with several fallbacks. */
const STAT_FIELD_PATHS: Record<string, Record<string, string[][]>> = {
  soccer: {
    shots_on_target: [["statistics", "0", "shots", "on"]],
    goals: [["statistics", "0", "goals", "total"]],
    assists: [["statistics", "0", "goals", "assists"]],
  },
  basketball: {
    points: [["points"], ["statistics", "0", "points"]],
    rebounds: [["rebounds", "total"], ["totReb"], ["statistics", "0", "rebounds", "total"]],
    assists: [["assists"], ["statistics", "0", "assists"]],
    three_pointers_made: [
      ["threePointGoals", "total"],
      ["tpm"],
      ["statistics", "0", "threepoint_goals", "total"],
    ],
  },
  football: {
    passing_yards: [["passing", "yards"], ["statistics", "0", "passing", "yards"]],
    rushing_yards: [["rushing", "yards"], ["statistics", "0", "rushing", "yards"]],
    receiving_yards: [["receiving", "yards"], ["statistics", "0", "receiving", "yards"]],
    receptions: [["receiving", "receptions"], ["statistics", "0", "receiving", "receptions"]],
    passing_touchdowns: [["passing", "touchdowns"], ["statistics", "0", "passing", "touchdowns"]],
  },
  baseball: {
    strikeouts: [["pitching", "strikeouts"], ["statistics", "0", "pitching", "strikeouts"]],
    hits: [["batting", "hits"], ["statistics", "0", "batting", "hits"]],
    total_bases: [["batting", "totalBases"], ["statistics", "0", "batting", "total_bases"]],
    home_runs: [["batting", "homeRuns"], ["statistics", "0", "batting", "home_runs"]],
  },
};

const DEFAULT_MAX_CALLS = 90;
const TEAM_HISTORY_DEPTH = 15;
const PLAYER_LOG_DEPTH = 8; // shallower than team history — one extra API call per game, per team

interface ApiSportsEnvelope<T> {
  response: T[];
  errors?: unknown;
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

function slug(...parts: string[]): string {
  return parts.join("-").toLowerCase().replace(/[^a-z0-9-]+/g, "");
}

interface LeagueSeason {
  leagueId: number;
  season: string | number;
}

export class ApiSportsStatsEnricher {
  private apiKey: string;
  private budget: number;
  private budgetWarned = false;
  private leagueCache = new Map<string, LeagueSeason | null>();
  private teamIdCache = new Map<string, number | null>();
  private gamePlayersCache = new Map<string, Record<string, unknown>[]>();

  constructor(apiKey: string, maxCalls = Number(process.env.API_SPORTS_MAX_CALLS ?? DEFAULT_MAX_CALLS)) {
    this.apiKey = apiKey;
    this.budget = maxCalls;
  }

  private async apiGet<T>(base: string, path: string, params: Record<string, string>): Promise<T[]> {
    if (this.budget <= 0) {
      if (!this.budgetWarned) {
        this.budgetWarned = true;
        console.warn(
          `[api-sports] API_SPORTS_MAX_CALLS budget exhausted for this scan — remaining leagues/players skipped. ` +
            `Raise API_SPORTS_MAX_CALLS or upgrade your api-sports plan for full coverage.`
        );
      }
      return [];
    }
    this.budget--;

    const url = new URL(base + path);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

    let res: Response;
    try {
      res = await fetch(url.toString(), { headers: { "x-apisports-key": this.apiKey } });
    } catch (err) {
      console.warn(`[api-sports] ${path} request failed: ${err instanceof Error ? err.message : err}`);
      return [];
    }
    if (!res.ok) {
      console.warn(`[api-sports] ${path} HTTP ${res.status}`);
      return [];
    }
    const body = (await res.json()) as ApiSportsEnvelope<T>;
    const errCount = Array.isArray(body.errors) ? body.errors.length : Object.keys(body.errors ?? {}).length;
    if (errCount) console.warn(`[api-sports] ${path} returned errors:`, body.errors);
    return body.response ?? [];
  }

  async enrich(data: DailyMarketData): Promise<DailyMarketData> {
    const teamGameLogs: TeamGameLogEntry[] = [...data.teamGameLogs];
    const players: PlayerDef[] = [...data.players];
    const playerGameLogs: PlayerGameLogEntry[] = [...data.playerGameLogs];
    const seenPlayerKeys = new Set(players.map((p) => p.key));

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

      const propTypes = CATALOG.find((l) => l.key === league.key)?.propTypes ?? [];

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

        const rawGames = await this.apiGet<Record<string, unknown>>(
          config.base,
          config.style === "fixtures" ? "/fixtures" : "/games",
          { team: String(teamId), season: String(leagueSeason.season), last: String(TEAM_HISTORY_DEPTH) }
        );
        teamGameLogs.push(
          ...rawGames.map((g) => this.mapGameToLog(g, teamId, teamKey)).filter((g): g is TeamGameLogEntry => g !== null)
        );

        if (propTypes.length) {
          const { players: newPlayers, logs } = await this.fetchPlayerLogsForTeamGames(
            config,
            rawGames.slice(0, PLAYER_LOG_DEPTH),
            teamId,
            teamKey,
            league.sportKey,
            propTypes,
            seenPlayerKeys
          );
          players.push(...newPlayers);
          playerGameLogs.push(...logs);
        }
      }
    }

    return { ...data, teamGameLogs, players, playerGameLogs };
  }

  private async resolveLeagueSeason(config: SportApiConfig, leagueName: string): Promise<LeagueSeason | null> {
    const cacheKey = `${config.base}:${leagueName}`;
    if (this.leagueCache.has(cacheKey)) return this.leagueCache.get(cacheKey) ?? null;

    const results = await this.apiGet<Record<string, unknown>>(config.base, "/leagues", { name: leagueName });
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

    const results = await this.apiGet<Record<string, unknown>>(config.base, "/teams", {
      league: String(ls.leagueId),
      season: String(ls.season),
      search: teamName,
    });
    const first = results[0];
    const id = first ? Number(firstOf(first, [["team", "id"], ["id"]])) : NaN;
    const resolved = Number.isFinite(id) ? id : null;
    this.teamIdCache.set(cacheKey, resolved);
    return resolved;
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
    const explicitWinner = firstOf(g, [isHome ? ["teams", "home", "winner"] : ["teams", "away", "winner"]]);
    const won = typeof explicitWinner === "boolean" ? explicitWinner : pointsFor > pointsAgainst;

    const opponentName = String((isHome ? awayTeam.name : homeTeam.name) ?? "Unknown");

    return { teamKey, date, opponent: opponentName, isHome, won, pointsFor, pointsAgainst };
  }

  /** Given a raw game/fixture record and the team we're tracking, name whichever side is the opponent. */
  private opponentNameFromGame(g: Record<string, unknown>, teamId: number): string {
    const homeTeam = firstOf(g, [["teams", "home"]]) as Record<string, unknown> | undefined;
    const awayTeam = firstOf(g, [["teams", "away"]]) as Record<string, unknown> | undefined;
    const isHome = Number(homeTeam?.id) === teamId;
    const opponent = isHome ? awayTeam : homeTeam;
    return String(opponent?.name ?? "Unknown");
  }

  /** Fetches per-game, all-players box scores for a handful of recent games and extracts the
   *  stats this league tracks props for. One extra API call per game (deduped across teams that
   *  share a game, e.g. two of today's teams that played each other recently). */
  private async fetchPlayerLogsForTeamGames(
    config: SportApiConfig,
    rawGames: Record<string, unknown>[],
    teamId: number,
    teamKey: string,
    sportKey: string,
    propTypes: string[],
    seenPlayerKeys: Set<string>
  ): Promise<{ players: PlayerDef[]; logs: PlayerGameLogEntry[] }> {
    const newPlayers: PlayerDef[] = [];
    const logs: PlayerGameLogEntry[] = [];
    const statPaths = STAT_FIELD_PATHS[sportKey];
    if (!statPaths) return { players: newPlayers, logs };

    for (const g of rawGames) {
      const gameId = firstOf(g, [["fixture", "id"], ["id"], ["game", "id"]]);
      const dateRaw = firstOf(g, [["fixture", "date"], ["date"], ["game", "date"]]);
      const date = dateRaw ? new Date(String(dateRaw)) : null;
      if (gameId == null || !date || Number.isNaN(date.getTime())) continue;
      const opponentName = this.opponentNameFromGame(g, teamId);

      const cacheKey = `${config.base}:${gameId}`;
      let blocks = this.gamePlayersCache.get(cacheKey);
      if (!blocks) {
        const path = config.style === "fixtures" ? "/fixtures/players" : "/games/statistics/players";
        const idParam = config.style === "fixtures" ? "fixture" : "id";
        blocks = await this.apiGet<Record<string, unknown>>(config.base, path, { [idParam]: String(gameId) });
        this.gamePlayersCache.set(cacheKey, blocks);
      }

      const teamBlock = blocks.find((b) => Number(firstOf(b, [["team", "id"]])) === teamId);
      const entries = (firstOf(teamBlock ?? {}, [["players"]]) as Record<string, unknown>[]) ?? [];

      for (const entry of entries) {
        const apiPlayerId = firstOf(entry, [["player", "id"], ["id"]]);
        const playerName = firstOf(entry, [["player", "name"], ["name"]]);
        if (apiPlayerId == null || !playerName) continue;

        // Skip players who didn't actually feature (soccer includes the full squad; 0 minutes
        // means they didn't play, so their stats would be misleading zeros, not real form).
        const minutes = Number(firstOf(entry, [["statistics", "0", "games", "minutes"]]));
        if (Number.isFinite(minutes) && minutes === 0) continue;

        const playerKey = slug(teamKey, String(apiPlayerId));
        if (!seenPlayerKeys.has(playerKey)) {
          seenPlayerKeys.add(playerKey);
          newPlayers.push({ key: playerKey, name: String(playerName), teamKey, propTypes });
        }

        for (const propType of propTypes) {
          const paths = statPaths[propType];
          if (!paths) continue;
          const value = Number(firstOf(entry, paths));
          if (!Number.isFinite(value)) continue;
          logs.push({ playerKey, date, opponent: opponentName, statType: propType, statValue: value });
        }
      }
    }

    return { players: newPlayers, logs };
  }
}
