import { runScan } from "../src/lib/scan";
import { prisma } from "../src/lib/db";

async function main() {
  console.log("Seeding database with an initial scan...");
  const result = await runScan();
  console.log(`Seeded. games=${result.gamesIngested} picks=${result.picksSaved} projections=${result.projectionsSaved}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
