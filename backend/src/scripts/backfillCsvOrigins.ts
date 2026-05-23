import prisma from "../db/prisma";

async function main() {
  const ids = process.argv.slice(2).map((id) => id.trim()).filter(Boolean);

  if (ids.length === 0) {
    throw new Error("Pass one or more stream IDs to backfill.");
  }

  const result = await prisma.stream.updateMany({
    where: {
      id: { in: ids },
    },
    data: {
      isCsvCreated: true,
    },
  });

  console.log(`Updated ${result.count} stream(s) to CSV origin.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
