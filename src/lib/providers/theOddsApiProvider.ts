import { CATALOG } from "./catalog";
import { impliedProbFromAmerican } from "../oddsMath";
import type { DailyMarketData, GameDef, MoneylineQuote, OddsProvider, TeamDef } from "./types";

const BASE_URL = "https://api.the-odds-api.com/v4";

function slug(...parts: string[]): string {
  return parts.join("-").toLowerCase().replace(/[^a-z0-9-]+/g, "");
}

/**
 * Real live-odds integration against https://the-odds-api.com — this is the legitimate way to
 * get FanDuel/DraftKings/BetMGM/Caesars lines: The Odds API has commercial agreements with those
 * books and republishes their real-time odds. It does NOT provide historical player/team
 * performance, so the value engine's "modeled probability" side still needs a stats feed — see
 * src/lib/statsProviders/apiSportsProvider.ts, composed in via providers/index.ts.
 *
 * To go live:
 *   1. Sign up at https://the-odds-api.com (free tier: 500 requests/month) and grab an API key
 *   2. Set ODDS_PROVIDER=the-odds-api and ODDS_API_KEY=<key> in .env
 *   3. (optional, needed for real edge modeling) set STATS_PROVIDER=api-sports and
 *      API_SPORTS_KEY=<key> from https://api-sports.io
 *
 * Player props aren't fetched here: The Odds API only exposes player-prop markets on paid plans,
 * via a separate per-event endpoint (`/v4/sports/{sport}/events/{id}/odds`). Add that once you're
 * on a plan that includes it — until then, props stay on the mock provider.
 */
export class TheOddsApiProvider implements OddsProvider {
  name = "the-odds-api";
  private apiKey: string;

  constructor(apiKey: string) {
    if (!apiKey) throw new Error("ODDS_API_KEY is required to use the-odds-api provider");
    this.apiKey = apiKey;
  }

  async fetchDailyMarket(): Promise<DailyMarketData> {
    const games: GameDef[] = [];
    const moneylines: MoneylineQuote[] = [];
    const teams: TeamDef[] = [];
    const seenTeamKeys = new Set<string>();

    for (const league of CATALOG) {
      const url = `${BASE_URL}/sports/${league.externalKey}/odds?apiKey=${this.apiKey}&regions=us&markets=h2h&oddsFormat=american`;
      let res: Response;
      try {
        res = await fetch(url);
      } catch (err) {
        console.warn(`[the-odds-api] ${league.key}: request failed — ${err instanceof Error ? err.message : err}`);
        continue;
      }
      if (!res.ok) {
        console.warn(`[the-odds-api] ${league.key}: HTTP ${res.status} — skipping`);
        continue;
      }
      const events = (await res.json()) as TheOddsApiEvent[];

      for (const event of events) {
        const gameKey = event.id;
        // Namespace team keys by league so a club playing in both a domestic league and a UEFA
        // competition (e.g. Inter Milan in Serie A *and* the Champions League) gets a distinct
        // Team row per competition instead of colliding on the raw team name.
        const homeTeamKey = slug(league.key, event.home_team);
        const awayTeamKey = slug(league.key, event.away_team);

        for (const [key, name] of [
          [homeTeamKey, event.home_team],
          [awayTeamKey, event.away_team],
        ] as const) {
          if (!seenTeamKeys.has(key)) {
            seenTeamKeys.add(key);
            teams.push({ key, name, shortName: name, leagueKey: league.key });
          }
        }

        games.push({
          key: gameKey,
          leagueKey: league.key,
          homeTeamKey,
          awayTeamKey,
          startTime: new Date(event.commence_time),
        });

        // Line-shop across every US book The Odds API returned for this event: take whichever
        // price is most favorable to the bettor on each side (lowest implied probability) rather
        // than just whatever the first-listed bookmaker happens to offer. The best home price and
        // best away price can legitimately come from two different books.
        let bestHome: { odds: number; bookmaker: string } | null = null;
        let bestAway: { odds: number; bookmaker: string } | null = null;
        for (const book of event.bookmakers ?? []) {
          const market = book.markets?.find((m) => m.key === "h2h");
          const homeOutcome = market?.outcomes?.find((o) => o.name === event.home_team);
          const awayOutcome = market?.outcomes?.find((o) => o.name === event.away_team);

          if (homeOutcome && (!bestHome || impliedProbFromAmerican(homeOutcome.price) < impliedProbFromAmerican(bestHome.odds))) {
            bestHome = { odds: homeOutcome.price, bookmaker: book.title };
          }
          if (awayOutcome && (!bestAway || impliedProbFromAmerican(awayOutcome.price) < impliedProbFromAmerican(bestAway.odds))) {
            bestAway = { odds: awayOutcome.price, bookmaker: book.title };
          }
        }
        if (bestHome && bestAway) {
          moneylines.push({
            gameKey,
            bookmaker: bestHome.bookmaker === bestAway.bookmaker ? bestHome.bookmaker : `${bestHome.bookmaker}/${bestAway.bookmaker}`,
            homeOdds: bestHome.odds,
            awayOdds: bestAway.odds,
          });
        }
      }
    }

    return {
      leagues: CATALOG.map((l) => ({
        key: l.key,
        name: l.name,
        sportKey: l.sportKey,
        sportName: l.sportName,
        externalKey: l.externalKey,
      })),
      teams,
      players: [],
      games,
      teamGameLogs: [],
      playerGameLogs: [],
      moneylines,
      propQuotes: [],
    };
  }
}

interface TheOddsApiEvent {
  id: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers: {
    title: string;
    markets: { key: string; outcomes: { name: string; price: number }[] }[];
  }[];
}
