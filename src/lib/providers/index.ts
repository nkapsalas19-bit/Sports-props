import { MockOddsProvider } from "./mockProvider";
import { TheOddsApiProvider } from "./theOddsApiProvider";
import { ApiSportsStatsEnricher } from "../statsProviders/apiSportsProvider";
import type { DailyMarketData, OddsProvider } from "./types";

export * from "./types";

/** Wraps a base odds provider with a stats provider that backfills TeamGameLog history. */
class StatsEnrichedProvider implements OddsProvider {
  name: string;
  constructor(private base: OddsProvider, private enricher: ApiSportsStatsEnricher) {
    this.name = base.name;
  }
  async fetchDailyMarket(): Promise<DailyMarketData> {
    const data = await this.base.fetchDailyMarket();
    try {
      return await this.enricher.enrich(data);
    } catch (err) {
      console.warn(`[stats-provider] enrichment failed, continuing with odds-only data: ${err instanceof Error ? err.message : err}`);
      return data;
    }
  }
}

export function getOddsProvider(): OddsProvider {
  const kind = process.env.ODDS_PROVIDER ?? "mock";
  if (kind === "the-odds-api") {
    const base = new TheOddsApiProvider(process.env.ODDS_API_KEY ?? "");
    if (process.env.STATS_PROVIDER === "api-sports" && process.env.API_SPORTS_KEY) {
      return new StatsEnrichedProvider(base, new ApiSportsStatsEnricher(process.env.API_SPORTS_KEY));
    }
    return base;
  }
  return new MockOddsProvider();
}
