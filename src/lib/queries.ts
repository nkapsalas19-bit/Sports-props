import { prisma } from "./db";

export interface PickFilters {
  sportKey?: string;
  leagueKey?: string;
  betType?: "MONEYLINE" | "PROP";
}

export async function getLatestSnapshot() {
  return prisma.marketSnapshot.findFirst({
    where: { picks: { some: {} } },
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

export async function getSportsWithLeagues() {
  return prisma.sport.findMany({
    include: { leagues: { orderBy: { name: "asc" } } },
    orderBy: { name: "asc" },
  });
}
