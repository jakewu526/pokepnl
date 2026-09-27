import "dotenv/config";
import { prisma } from "@/lib/prisma";

// Prints unresolved user reports, oldest first. Apple expects reports to be
// acted on within about a day, so run this daily once the app is public.
// After dealing with one, mark it done:
//   npm run reports:list -- --resolve <reportId>
async function main() {
  const resolveIdx = process.argv.indexOf("--resolve");
  if (resolveIdx !== -1) {
    const id = process.argv[resolveIdx + 1];
    if (!id) throw new Error("Usage: npm run reports:list -- --resolve <reportId>");
    await prisma.userReport.update({ where: { id }, data: { resolvedAt: new Date() } });
    console.log(`Resolved ${id}`);
    return;
  }

  const reports = await prisma.userReport.findMany({
    where: { resolvedAt: null },
    orderBy: { createdAt: "asc" },
    include: {
      reporter: { select: { email: true } },
      reported: { select: { id: true, email: true, name: true } },
    },
  });

  if (reports.length === 0) {
    console.log("No open reports.");
    return;
  }

  for (const r of reports) {
    console.log(`${r.id}  ${r.createdAt.toISOString()}  ${r.reason}`);
    console.log(`  reported: ${r.reported.name ?? "(no name)"} <${r.reported.email}> [${r.reported.id}]`);
    console.log(`  by:       ${r.reporter.email}`);
    if (r.details) console.log(`  details:  ${r.details}`);
  }
  console.log(`\n${reports.length} open report(s).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
