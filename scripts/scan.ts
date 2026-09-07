/**
 * Standalone entry point for the daily scan — run manually, or wire up to a
 * scheduler (cron, Vercel Cron, GitHub Actions) to run once each morning.
 *
 *   npm run scan
 */
import { runScan } from "../src/lib/scan";
import { prisma } from "../src/lib/db";

async function main() {
  console.log("Running daily scan...");
  const result = await runScan();
  console.log(`Done. Provider=${result.provider} games=${result.gamesIngested} ` +
    `candidates=${result.candidatesEvaluated} picks saved=${result.picksSaved} ` +
    `projections saved=${result.projectionsSaved} snapshot=${result.snapshotId}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
