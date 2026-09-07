import { MockOddsProvider } from "./mockProvider";
import { TheOddsApiProvider } from "./theOddsApiProvider";
import type { OddsProvider } from "./types";

export * from "./types";

export function getOddsProvider(): OddsProvider {
  const kind = process.env.ODDS_PROVIDER ?? "mock";
  if (kind === "the-odds-api") {
    return new TheOddsApiProvider(process.env.ODDS_API_KEY ?? "");
  }
  return new MockOddsProvider();
}
