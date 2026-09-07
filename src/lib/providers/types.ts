export interface LeagueDef {
  key: string;
  name: string;
  sportKey: string;
  sportName: string;
  externalKey?: string;
}

export interface TeamDef {
  key: string;
  name: string;
  shortName: string;
  leagueKey: string;
}

export interface PlayerDef {
  key: string;
  name: string;
  position?: string;
  teamKey: string;
  propTypes: string[]; // which stat types this player has meaningful prop markets for
}

export interface GameDef {
  key: string;
  leagueKey: string;
  homeTeamKey: string;
  awayTeamKey: string;
  startTime: Date;
}

export interface TeamGameLogEntry {
  teamKey: string;
  date: Date;
  opponent: string;
  isHome: boolean;
  won: boolean;
  pointsFor: number;
  pointsAgainst: number;
}

export interface PlayerGameLogEntry {
  playerKey: string;
  date: Date;
  opponent: string;
  statType: string;
  statValue: number;
}

export interface MoneylineQuote {
  gameKey: string;
  bookmaker: string;
  homeOdds: number;
  awayOdds: number;
}

export interface PropQuote {
  gameKey: string;
  playerKey: string;
  propType: string;
  line: number;
  overOdds: number;
  underOdds: number;
  bookmaker: string;
}

export interface DailyMarketData {
  leagues: LeagueDef[];
  teams: TeamDef[];
  players: PlayerDef[];
  games: GameDef[];
  teamGameLogs: TeamGameLogEntry[];
  playerGameLogs: PlayerGameLogEntry[];
  moneylines: MoneylineQuote[];
  propQuotes: PropQuote[];
}

export interface OddsProvider {
  name: string;
  /** Pulls (or generates) everything needed for one day's scan: catalog, history, and today's lines. */
  fetchDailyMarket(): Promise<DailyMarketData>;
}
