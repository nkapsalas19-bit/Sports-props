import { prisma } from "./db";
import { getOddsProvider } from "./providers";
import type { TeamGameLogEntry } from "./providers/types";
import {
  modelMoneylineProb,
  modelPropOverProb,
  rankPicks,
  weightedRecentAverage,
  type PickCandidateInput,
  type TeamHistoryInput,
} from "./valueEngine";

const MIN_PROJECTION_SAMPLE = 4;

export interface ScanResult {
  snapshotId: string;
  provider: string;
  gamesIngested: number;
  candidatesEvaluated: number;
  picksSaved: number;
  projectionsSaved: number;
}

export async function runScan(): Promise<ScanResult> {
  const provider = getOddsProvider();
  const data = await provider.fetchDailyMarket();

  // --- 1. Sports & Leagues -------------------------------------------------
  const sportByKey = new Map<string, string>();
  const uniqueSports = new Map<string, string>();
  for (const l of data.leagues) uniqueSports.set(l.sportKey, l.sportName);
  for (const [key, name] of uniqueSports) {
    const sport = await prisma.sport.upsert({ where: { key }, update: { name }, create: { key, name } });
    sportByKey.set(key, sport.id);
  }

  const leagueByKey = new Map<string, string>();
  for (const l of data.leagues) {
    const sportId = sportByKey.get(l.sportKey);
    if (!sportId) continue;
    const league = await prisma.league.upsert({
      where: { key: l.key },
      update: { name: l.name, externalKey: l.externalKey, sportId },
      create: { key: l.key, name: l.name, externalKey: l.externalKey, sportId },
    });
    leagueByKey.set(l.key, league.id);
  }

  // --- 2. Teams (also pick up any referenced only by games, for real providers) ---
  const teamLeagueOf = new Map<string, string>();
  for (const t of data.teams) teamLeagueOf.set(t.key, t.leagueKey);
  for (const g of data.games) {
    if (!teamLeagueOf.has(g.homeTeamKey)) teamLeagueOf.set(g.homeTeamKey, g.leagueKey);
    if (!teamLeagueOf.has(g.awayTeamKey)) teamLeagueOf.set(g.awayTeamKey, g.leagueKey);
  }
  const teamDefByKey = new Map(data.teams.map((t) => [t.key, t]));
  const teamByKey = new Map<string, string>();
  const teamNameByKey = new Map<string, string>();
  for (const [key, leagueKey] of teamLeagueOf) {
    const leagueId = leagueByKey.get(leagueKey);
    if (!leagueId) continue;
    const def = teamDefByKey.get(key);
    const name = def?.name ?? key;
    const shortName = def?.shortName ?? name;
    const team = await prisma.team.upsert({
      where: { externalKey: key },
      update: { name, shortName, leagueId },
      create: { name, shortName, leagueId, externalKey: key },
    });
    teamByKey.set(key, team.id);
    teamNameByKey.set(key, name);
  }

  // --- 3. Players ------------------------------------------------------------
  const playerByKey = new Map<string, string>();
  const playerNameByKey = new Map<string, string>();
  for (const p of data.players) {
    const teamId = teamByKey.get(p.teamKey);
    if (!teamId) continue;
    const player = await prisma.player.upsert({
      where: { externalKey: p.key },
      update: { name: p.name, position: p.position, teamId },
      create: { name: p.name, position: p.position, teamId, externalKey: p.key },
    });
    playerByKey.set(p.key, player.id);
    playerNameByKey.set(p.key, p.name);
  }

  // --- 4. Historical logs: refresh fully for touched teams/players -----------
  const touchedTeamIds = [...teamByKey.values()];
  const touchedPlayerIds = [...playerByKey.values()];
  if (touchedTeamIds.length) {
    await prisma.teamGameLog.deleteMany({ where: { teamId: { in: touchedTeamIds } } });
  }
  if (touchedPlayerIds.length) {
    await prisma.playerGameLog.deleteMany({ where: { playerId: { in: touchedPlayerIds } } });
  }
  if (data.teamGameLogs.length) {
    await prisma.teamGameLog.createMany({
      data: data.teamGameLogs
        .filter((l) => teamByKey.has(l.teamKey))
        .map((l) => ({
          teamId: teamByKey.get(l.teamKey)!,
          date: l.date,
          opponent: l.opponent,
          isHome: l.isHome,
          won: l.won,
          pointsFor: l.pointsFor,
          pointsAgainst: l.pointsAgainst,
        })),
    });
  }
  if (data.playerGameLogs.length) {
    await prisma.playerGameLog.createMany({
      data: data.playerGameLogs
        .filter((l) => playerByKey.has(l.playerKey))
        .map((l) => ({
          playerId: playerByKey.get(l.playerKey)!,
          date: l.date,
          opponent: l.opponent,
          statType: l.statType,
          statValue: l.statValue,
        })),
    });
  }

  // --- 5. Games ---------------------------------------------------------------
  const gameByKey = new Map<string, string>();
  for (const g of data.games) {
    const leagueId = leagueByKey.get(g.leagueKey);
    const homeTeamId = teamByKey.get(g.homeTeamKey);
    const awayTeamId = teamByKey.get(g.awayTeamKey);
    if (!leagueId || !homeTeamId || !awayTeamId) continue;
    const game = await prisma.game.upsert({
      where: { externalKey: g.key },
      update: { leagueId, homeTeamId, awayTeamId, startTime: g.startTime },
      create: { leagueId, homeTeamId, awayTeamId, startTime: g.startTime, externalKey: g.key },
    });
    gameByKey.set(g.key, game.id);
  }

  // --- 6. Snapshot + market rows ------------------------------------------------
  const snapshot = await prisma.marketSnapshot.create({ data: { provider: provider.name } });

  if (data.moneylines.length) {
    await prisma.moneylineOdds.createMany({
      data: data.moneylines
        .filter((m) => gameByKey.has(m.gameKey))
        .map((m) => ({
          snapshotId: snapshot.id,
          gameId: gameByKey.get(m.gameKey)!,
          bookmaker: m.bookmaker,
          homeOdds: m.homeOdds,
          awayOdds: m.awayOdds,
        })),
    });
  }
  if (data.propQuotes.length) {
    await prisma.propMarket.createMany({
      data: data.propQuotes
        .filter((p) => gameByKey.has(p.gameKey) && playerByKey.has(p.playerKey))
        .map((p) => ({
          snapshotId: snapshot.id,
          gameId: gameByKey.get(p.gameKey)!,
          playerId: playerByKey.get(p.playerKey)!,
          propType: p.propType,
          line: p.line,
          overOdds: p.overOdds,
          underOdds: p.underOdds,
          bookmaker: p.bookmaker,
        })),
    });
  }

  // --- 7. Value engine: build candidates from in-memory data ------------------
  const teamLogsByKey = groupBy(data.teamGameLogs, (l) => l.teamKey);
  const playerLogsByKey = groupBy(data.playerGameLogs, (l) => l.playerKey);
  const gameDefByKey = new Map(data.games.map((g) => [g.key, g]));

  const candidates: PickCandidateInput[] = [];

  for (const ml of data.moneylines) {
    const g = gameDefByKey.get(ml.gameKey);
    if (!g) continue;
    const homeLogs = toTeamHistory(teamLogsByKey.get(g.homeTeamKey) ?? []);
    const awayLogs = toTeamHistory(teamLogsByKey.get(g.awayTeamKey) ?? []);
    const homeName = teamNameByKey.get(g.homeTeamKey) ?? g.homeTeamKey;
    const awayName = teamNameByKey.get(g.awayTeamKey) ?? g.awayTeamKey;
    const contextLabel = `${awayName} @ ${homeName}`;

    const homeModel = modelMoneylineProb(homeLogs, awayLogs, true);
    const awayModel = modelMoneylineProb(awayLogs, homeLogs, false);

    candidates.push({
      gameKey: g.key,
      betType: "MONEYLINE",
      side: "HOME",
      americanOdds: ml.homeOdds,
      modeled: homeModel,
      contextLabel: `${contextLabel} — ${homeName} ML`,
    });
    candidates.push({
      gameKey: g.key,
      betType: "MONEYLINE",
      side: "AWAY",
      americanOdds: ml.awayOdds,
      modeled: awayModel,
      contextLabel: `${contextLabel} — ${awayName} ML`,
    });
  }

  for (const pq of data.propQuotes) {
    const g = gameDefByKey.get(pq.gameKey);
    if (!g) continue;
    const playerLogs = (playerLogsByKey.get(pq.playerKey) ?? []).filter((l) => l.statType === pq.propType);
    const overModel = modelPropOverProb(
      playerLogs.map((l) => ({ statValue: l.statValue, date: l.date })),
      pq.line
    );
    const underModel = { ...overModel, prob: 1 - overModel.prob };
    const playerName = playerNameByKey.get(pq.playerKey) ?? pq.playerKey;
    const label = `${playerName} ${pq.line} ${pq.propType.replace(/_/g, " ")}`;

    candidates.push({
      gameKey: g.key,
      betType: "PROP",
      side: "OVER",
      americanOdds: pq.overOdds,
      modeled: overModel,
      playerKey: pq.playerKey,
      playerName,
      propType: pq.propType,
      line: pq.line,
      contextLabel: `${label} Over`,
    });
    candidates.push({
      gameKey: g.key,
      betType: "PROP",
      side: "UNDER",
      americanOdds: pq.underOdds,
      modeled: underModel,
      playerKey: pq.playerKey,
      playerName,
      propType: pq.propType,
      line: pq.line,
      contextLabel: `${label} Under`,
    });
  }

  const ranked = rankPicks(candidates);

  if (ranked.length) {
    await prisma.pick.createMany({
      data: ranked.map((p) => ({
        snapshotId: snapshot.id,
        gameId: gameByKey.get(p.gameKey)!,
        betType: p.betType,
        side: p.side,
        playerId: p.playerKey ? playerByKey.get(p.playerKey) : undefined,
        playerName: p.playerName,
        propType: p.propType,
        line: p.line,
        americanOdds: p.americanOdds,
        impliedProb: p.impliedProb,
        modeledProb: p.modeled.prob,
        edge: p.edge,
        confidence: p.modeled.confidence,
        score: p.score,
        rationale: p.rationale,
      })),
    });
  }

  // --- 8. Pure stats-based player projections (no sportsbook price involved) --
  // Only for player+propType combos that don't already have a real market line above — if a
  // book is already priced, show that real Pick, not a synthetic reference number alongside it.
  const pricedPropKeys = new Set(data.propQuotes.map((p) => `${p.playerKey}:${p.propType}`));
  const playerTeamKeyOf = new Map(data.players.map((p) => [p.key, p.teamKey]));
  const gameKeyByTeamKey = new Map<string, { gameKey: string; opponentTeamKey: string }>();
  for (const g of data.games) {
    gameKeyByTeamKey.set(g.homeTeamKey, { gameKey: g.key, opponentTeamKey: g.awayTeamKey });
    gameKeyByTeamKey.set(g.awayTeamKey, { gameKey: g.key, opponentTeamKey: g.homeTeamKey });
  }

  const projections: {
    gameId: string;
    playerId: string;
    playerName: string;
    propType: string;
    projectedLine: number;
    recentAvg: number;
    hitRate: number;
    sampleSize: number;
    vsOpponentAvg?: number;
    vsOpponentGames?: number;
    rationale: string;
  }[] = [];

  for (const [playerKey, logsForPlayer] of playerLogsByKey) {
    const playerId = playerByKey.get(playerKey);
    const teamKey = playerTeamKeyOf.get(playerKey);
    const todaysGame = teamKey ? gameKeyByTeamKey.get(teamKey) : undefined;
    const gameId = todaysGame ? gameByKey.get(todaysGame.gameKey) : undefined;
    if (!playerId || !gameId || !todaysGame) continue;

    const statTypes = new Set(logsForPlayer.map((l) => l.statType));
    for (const statType of statTypes) {
      if (pricedPropKeys.has(`${playerKey}:${statType}`)) continue;

      const logs = logsForPlayer.filter((l) => l.statType === statType);
      if (logs.length < MIN_PROJECTION_SAMPLE) continue;

      const recentAvg = weightedRecentAverage(logs.map((l) => ({ statValue: l.statValue, date: l.date })));
      const projectedLine = Math.max(0.5, Math.round(recentAvg * 2) / 2);
      const modeled = modelPropOverProb(
        logs.map((l) => ({ statValue: l.statValue, date: l.date })),
        projectedLine
      );

      const opponentName = teamNameByKey.get(todaysGame.opponentTeamKey) ?? "";
      const vsOpponentLogs = opponentName
        ? logs.filter((l) => l.opponent.toLowerCase() === opponentName.toLowerCase())
        : [];
      const vsOpponentAvg = vsOpponentLogs.length >= 2
        ? vsOpponentLogs.reduce((s, l) => s + l.statValue, 0) / vsOpponentLogs.length
        : undefined;

      const playerName = playerNameByKey.get(playerKey) ?? playerKey;
      const statLabel = statType.replace(/_/g, " ");
      let rationale =
        `${playerName} is averaging ${recentAvg.toFixed(1)} ${statLabel} over their last ${logs.length} games ` +
        `(clearing ${projectedLine} in ${(modeled.prob * 100).toFixed(0)}% of them).`;
      if (vsOpponentAvg !== undefined) {
        rationale += ` Averaging ${vsOpponentAvg.toFixed(1)} in ${vsOpponentLogs.length} career meetings with ${opponentName}.`;
      }
      rationale += " No live sportsbook line for this yet — this is our own projection from recent form, not a market price.";

      projections.push({
        gameId,
        playerId,
        playerName,
        propType: statType,
        projectedLine,
        recentAvg,
        hitRate: modeled.prob,
        sampleSize: logs.length,
        vsOpponentAvg,
        vsOpponentGames: vsOpponentAvg !== undefined ? vsOpponentLogs.length : undefined,
        rationale,
      });
    }
  }

  if (projections.length) {
    await prisma.playerProjection.createMany({
      data: projections.map((p) => ({ snapshotId: snapshot.id, ...p })),
    });
  }

  return {
    snapshotId: snapshot.id,
    provider: provider.name,
    gamesIngested: gameByKey.size,
    candidatesEvaluated: candidates.length,
    picksSaved: ranked.length,
    projectionsSaved: projections.length,
  };
}

function groupBy<T, K>(items: T[], keyFn: (item: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const item of items) {
    const key = keyFn(item);
    const arr = map.get(key);
    if (arr) arr.push(item);
    else map.set(key, [item]);
  }
  return map;
}

function toTeamHistory(logs: TeamGameLogEntry[]): TeamHistoryInput[] {
  return logs.map((l) => ({ won: l.won, isHome: l.isHome, date: l.date }));
}
