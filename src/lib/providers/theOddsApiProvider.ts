import { CATALOG } from "./catalog";
import type { DailyMarketData, GameDef, MoneylineQuote, OddsProvider } from "./types";

const BASE_URL = "https://api.the-odds-api.com/v4";

/**
 * Real live-odds integration against https://the-odds-api.com.
 *
 * IMPORTANT: The Odds API gives you *lines*, not historical player/team performance.
 * To power the value engine's "modeled probability" side for player props and moneylines
 * you still need a stats feed (e.g. SportsDataIO, Sportradar, or your own scraped box
 * scores) to populate TeamGameLog / PlayerGameLog. Until that's wired up, this provider
 * returns moneyline markets with empty history arrays, so the value engine will treat
 * every game as low-confidence (see valueEngine.ts) rather than fabricate a probability.
 *
 * To go live:
 *   1. Set ODDS_PROVIDER=the-odds-api and ODDS_API_KEY in your .env
 *   2. Implement fetchHistoricalStats() below against your stats provider of choice
 *   3. (optional) extend fetchPropMarkets() — The Odds API exposes player props under
 *      the `/events/{id}/odds` endpoint with sport-specific market keys, gated behind
 *      higher-tier plans.
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

    for (const league of CATALOG) {
      const url = `${BASE_URL}/sports/${league.externalKey}/odds?apiKey=${this.apiKey}&regions=us,uk&markets=h2h&oddsFormat=american`;
      const res = await fetch(url);
      if (!res.ok) {
        console.warn(`[the-odds-api] ${league.key}: HTTP ${res.status} — skipping`);
        continue;
      }
      const events = (await res.json()) as TheOddsApiEvent[];

      for (const event of events) {
        const gameKey = event.id;
        games.push({
          key: gameKey,
          leagueKey: league.key,
          homeTeamKey: event.home_team,
          awayTeamKey: event.away_team,
          startTime: new Date(event.commence_time),
        });

        const book = event.bookmakers?.[0];
        const market = book?.markets?.find((m) => m.key === "h2h");
        const homeOutcome = market?.outcomes?.find((o) => o.name === event.home_team);
        const awayOutcome = market?.outcomes?.find((o) => o.name === event.away_team);
        if (book && homeOutcome && awayOutcome) {
          moneylines.push({
            gameKey,
            bookmaker: book.title,
            homeOdds: homeOutcome.price,
            awayOdds: awayOutcome.price,
          });
        }
      }
    }

    // Team/player names from The Odds API don't map 1:1 to a roster without another
    // API call per sport; left as an exercise for whichever stats provider you wire in.
    return {
      leagues: CATALOG.map((l) => ({
        key: l.key,
        name: l.name,
        sportKey: l.sportKey,
        sportName: l.sportName,
        externalKey: l.externalKey,
      })),
      teams: [],
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
