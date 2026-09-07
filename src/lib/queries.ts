import { prisma } from "./db";

export interface PickFilters {
  sportKey?: string;
  leagueKey?: string;
  betType?: "MONEYLINE" | "PROP";
}

export async function getLatestSnapshot() {
  return prisma.marketSnapshot.findFirst({
    where: { OR: [{ picks: { some: {} } }, { projections: { some: {} } }] },
    orderBy: { scanDate: "desc" },
  });
}

export async function getPicksForSnapshot(snapshotId: string, filters: PickFilters = {}) {
  return prisma.pick.findMany({
    where: {
      snapshotId,
      betType: filters.betType,
      game: {
        league: {
          key: filters.leagueKey,
          sport: filters.sportKey ? { key: filters.sportKey } : undefined,
        },
      },
    },
    include: {
      game: {
        include: {
          league: { include: { sport: true } },
          homeTeam: true,
          awayTeam: true,
        },
      },
    },
    orderBy: { score: "desc" },
    take: 100,
  });
}

export interface ProjectionFilters {
  sportKey?: string;
  leagueKey?: string;
}

export async function getProjectionsForSnapshot(snapshotId: string, filters: ProjectionFilters = {}) {
  return prisma.playerProjection.findMany({
    where: {
      snapshotId,
      game: {
        league: {
          key: filters.leagueKey,
          sport: filters.sportKey ? { key: filters.sportKey } : undefined,
        },
      },
    },
    include: {
      game: {
        include: {
          league: { include: { sport: true } },
          homeTeam: true,
          awayTeam: true,
        },
      },
      player: { include: { team: true } },
    },
    orderBy: [{ sampleSize: "desc" }, { hitRate: "desc" }],
    take: 60,
  });
}

export async function getSportsWithLeagues() {
  return prisma.sport.findMany({
    include: { leagues: { orderBy: { name: "asc" } } },
    orderBy: { name: "asc" },
  });
}
