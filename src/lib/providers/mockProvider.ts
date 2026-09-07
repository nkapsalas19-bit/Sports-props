import { CATALOG, FIRST_NAMES, LAST_NAMES } from "./catalog";
import { Rng } from "../seededRandom";
import { americanFromImpliedProb } from "../oddsMath";
import type {
  DailyMarketData,
  GameDef,
  LeagueDef,
  MoneylineQuote,
  OddsProvider,
  PlayerDef,
  PlayerGameLogEntry,
  PropQuote,
  TeamDef,
  TeamGameLogEntry,
} from "./types";

const HOME_ADVANTAGE = 60; // Elo-like points

const STAT_RANGES: Record<string, { min: number; max: number }> = {
  points: { min: 8, max: 28 },
  rebounds: { min: 2, max: 11 },
  assists: { min: 1, max: 9 },
  three_pointers_made: { min: 0.5, max: 4 },
  passing_yards: { min: 180, max: 320 },
  rushing_yards: { min: 20, max: 110 },
  receiving_yards: { min: 20, max: 100 },
  receptions: { min: 2, max: 8 },
  passing_touchdowns: { min: 0.5, max: 2.5 },
  strikeouts: { min: 3, max: 9 },
  hits: { min: 0.5, max: 2 },
  total_bases: { min: 0.5, max: 3 },
  home_runs: { min: 0.05, max: 0.4 },
  shots_on_target: { min: 0.3, max: 3 },
  goals: { min: 0.05, max: 0.6 },
  assists_soccer: { min: 0.05, max: 0.4 },
};

function statRangeFor(propType: string): { min: number; max: number } {
  if (propType === "assists") return STAT_RANGES.assists; // basketball assists already covers this
  return STAT_RANGES[propType] ?? { min: 1, max: 5 };
}

function slug(...parts: string[]): string {
  return parts.join("-").toLowerCase().replace(/[^a-z0-9-]+/g, "");
}

function teamPointsRangeFor(sportKey: string): { mean: number; std: number } {
  switch (sportKey) {
    case "basketball":
      return { mean: 112, std: 10 };
    case "football":
      return { mean: 23, std: 8 };
    case "baseball":
      return { mean: 4.5, std: 2.3 };
    case "soccer":
    default:
      return { mean: 1.4, std: 1.1 };
  }
}

export class MockOddsProvider implements OddsProvider {
  name = "mock";
  private daySeed: string;

  constructor(daySeed?: string) {
    // Same-day scans are stable; a new calendar day naturally produces a fresh slate.
    this.daySeed = daySeed ?? new Date().toISOString().slice(0, 10);
  }

  async fetchDailyMarket(): Promise<DailyMarketData> {
    const rng = new Rng(this.daySeed);

    const leagues: LeagueDef[] = [];
    const teams: TeamDef[] = [];
    const players: PlayerDef[] = [];
    const games: GameDef[] = [];
    const teamGameLogs: TeamGameLogEntry[] = [];
    const playerGameLogs: PlayerGameLogEntry[] = [];
    const moneylines: MoneylineQuote[] = [];
    const propQuotes: PropQuote[] = [];

    const teamStrength = new Map<string, number>();
    const now = new Date();

    for (const league of CATALOG) {
      leagues.push({
        key: league.key,
        name: league.name,
        sportKey: league.sportKey,
        sportName: league.sportName,
        externalKey: league.externalKey,
      });

      const leagueTeamKeys: string[] = [];

      for (const teamName of league.teams) {
        const teamKey = slug(league.key, teamName);
        leagueTeamKeys.push(teamKey);
        teams.push({
          key: teamKey,
          name: teamName,
          shortName: teamName.split(" ").slice(-1)[0],
          leagueKey: league.key,
        });
        teamStrength.set(teamKey, rng.gaussian(1500, 150));

        // --- players for this team ---
        const rosterSize = rng.int(3, 5);
        for (let i = 0; i < rosterSize; i++) {
          const playerName = `${rng.pick(FIRST_NAMES)} ${rng.pick(LAST_NAMES)}`;
          const playerKey = slug(teamKey, playerName, String(i));
          const roleFactor = rng.float(0.3, 1.0);
          players.push({
            key: playerKey,
            name: playerName,
            teamKey,
            propTypes: league.propTypes,
          });

          // historical game logs per stat type
          const gamesPlayed = rng.int(12, 20);
          for (const propType of league.propTypes) {
            const range = statRangeFor(propType);
            const mean = range.min + roleFactor * (range.max - range.min);
            const std = Math.max(mean * 0.35, 0.15);
            for (let g = 0; g < gamesPlayed; g++) {
              const daysAgo = (gamesPlayed - g) * rng.int(2, 5);
              const date = new Date(now.getTime() - daysAgo * 86400000);
              const value = Math.max(0, rng.gaussian(mean, std));
              playerGameLogs.push({
                playerKey,
                date,
                opponent: rng.pick(league.teams.filter((t) => t !== teamName)),
                statType: propType,
                statValue: Math.round(value * 10) / 10,
              });
            }
          }
        }

        // --- historical team results ---
        const strength = teamStrength.get(teamKey)!;
        const teamGames = rng.int(15, 22);
        const { mean: ptsMean, std: ptsStd } = teamPointsRangeFor(league.sportKey);
        for (let g = 0; g < teamGames; g++) {
          const daysAgo = (teamGames - g) * rng.int(2, 5);
          const date = new Date(now.getTime() - daysAgo * 86400000);
          const isHome = rng.bool();
          const oppStrength = rng.gaussian(1500, 150);
          const winProb = eloWinProb(strength + (isHome ? HOME_ADVANTAGE : 0), oppStrength);
          const won = rng.bool(winProb);
          const pointsFor = Math.max(0, Math.round(rng.gaussian(ptsMean, ptsStd) * (won ? 1.08 : 0.94) * 10) / 10);
          const pointsAgainst = Math.max(0, Math.round(rng.gaussian(ptsMean, ptsStd) * (won ? 0.92 : 1.06) * 10) / 10);
          teamGameLogs.push({
            teamKey,
            date,
            opponent: rng.pick(league.teams.filter((t) => t !== teamName)),
            isHome,
            won,
            pointsFor,
            pointsAgainst,
          });
        }
      }

      // --- today's games for this league ---
      const shuffled = [...leagueTeamKeys].sort(() => rng.float(-1, 1));
      const numGames = Math.min(Math.floor(shuffled.length / 2), rng.int(2, 4));
      for (let i = 0; i < numGames; i++) {
        const homeTeamKey = shuffled[i * 2];
        const awayTeamKey = shuffled[i * 2 + 1];
        const gameKey = slug(league.key, homeTeamKey, awayTeamKey);
        const startTime = new Date(now);
        startTime.setHours(rng.int(12, 21), rng.pick([0, 15, 30, 45]), 0, 0);

        games.push({ key: gameKey, leagueKey: league.key, homeTeamKey, awayTeamKey, startTime });

        // --- moneyline odds (book adds ~5% overround, plus a little noise vs "true" strength) ---
        const homeStrength = teamStrength.get(homeTeamKey)! + HOME_ADVANTAGE;
        const awayStrength = teamStrength.get(awayTeamKey)!;
        const trueHomeProb = eloWinProb(homeStrength, awayStrength);
        const bookNoise = rng.gaussian(0, 0.04);
        const bookHomeProb = clamp(trueHomeProb + bookNoise, 0.05, 0.95);
        const overround = 1.05;
        const homeOddsProb = clamp((bookHomeProb * overround) / (bookHomeProb + (1 - bookHomeProb)), 0.03, 0.97);
        const awayOddsProb = clamp(overround - homeOddsProb, 0.03, 0.97);

        moneylines.push({
          gameKey,
          bookmaker: "ConsensusBook",
          homeOdds: americanFromImpliedProb(homeOddsProb),
          awayOdds: americanFromImpliedProb(awayOddsProb),
        });

        // --- prop markets: pick a couple of players per side ---
        for (const teamKey of [homeTeamKey, awayTeamKey]) {
          const teamPlayers = players.filter((p) => p.teamKey === teamKey);
          const featured = teamPlayers.slice(0, rng.int(1, Math.min(3, teamPlayers.length)));
          for (const player of featured) {
            const propType = rng.pick(player.propTypes);
            const logs = playerGameLogs.filter((l) => l.playerKey === player.key && l.statType === propType);
            const values = logs.map((l) => l.statValue);
            const avg = values.reduce((s, v) => s + v, 0) / Math.max(values.length, 1);
            const variance = values.reduce((s, v) => s + (v - avg) ** 2, 0) / Math.max(values.length, 1);
            const std = Math.sqrt(variance);
            // A real book's line moves around its own projection, not just the historical mean —
            // noise scaled to the stat's own variance keeps low-mean counting stats (goals, home
            // runs) from all clustering at the 0.5 floor with an artificial "under" bias.
            const lineNoise = rng.gaussian(0, Math.max(std * 0.45, 0.12));
            const line = Math.max(0.5, Math.round((avg + lineNoise) * 2) / 2);
            const overVig = rng.int(-125, -100);
            const underVig = rng.int(-125, -100);

            propQuotes.push({
              gameKey,
              playerKey: player.key,
              propType,
              line,
              overOdds: overVig,
              underOdds: underVig,
              bookmaker: "ConsensusBook",
            });
          }
        }
      }
    }

    return { leagues, teams, players, games, teamGameLogs, playerGameLogs, moneylines, propQuotes };
  }
}

function eloWinProb(ratingA: number, ratingB: number): number {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(Math.max(v, min), max);
}
