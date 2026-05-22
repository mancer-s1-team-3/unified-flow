import prisma from "../db/prisma";

const DEFAULT_STREAM_IDS = [
  "EXYcouWYKSPmJdXQtRPis3ig7Dki4qh7UTLn4UJQDx2k",
  "AVLaL6Jegd6aNX2PwNfFS19YEXyLsr1nFZrquXuFaTKd",
  "7rSqsFbmMk1JmB7bXyYfEyeUET32aD3fG51sCQGDBBLW",
];

function csvEscape(value: unknown) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

function buildCsvContent(streams: any[]) {
  const headers = ["recipient", "amount", "mint", "type", "duration", "cliff_duration", "cancelable", "milestones"];

  const rows = streams.map((stream) => {
    const startTs = Number(stream.startTs ?? 0);
    const endTs = Number(stream.endTs ?? 0);
    const cliffTs = Number(stream.cliffTs ?? 0);
    const type = Number(stream.vestingType ?? 0);
    const duration = Math.max(endTs - startTs, 0);
    const cliffDuration = type === 1 ? Math.max(cliffTs - startTs, 0) : 0;

    return [
      stream.recipient,
      String(stream.totalAmount ?? "0"),
      stream.mint,
      type,
      duration,
      cliffDuration,
      stream.cancelable ? "true" : "false",
      stream.milestones || "",
    ]
      .map(csvEscape)
      .join(",");
  });

  return [headers.join(","), ...rows].join("\n");
}

async function main() {
  const inputIds = process.argv.slice(2).map((id) => id.trim()).filter(Boolean);
  const streamIds = inputIds.length > 0 ? inputIds : DEFAULT_STREAM_IDS;

  const streams = await prisma.stream.findMany({
    where: { id: { in: streamIds } },
    orderBy: { createdAt: "asc" },
  });

  const missingIds = streamIds.filter((id) => !streams.some((stream) => stream.id === id));
  if (missingIds.length > 0) {
    throw new Error(`Missing stream(s): ${missingIds.join(", ")}`);
  }

  const orderedStreams = streamIds.map((id) => streams.find((stream) => stream.id === id)).filter(Boolean);
  const content = buildCsvContent(orderedStreams);

  await prisma.$transaction(async (tx) => {
    await tx.csvUpload.deleteMany();
    await tx.csvUpload.create({
      data: {
        version: 1,
        filename: "bulk_create_v1.csv",
        content,
        uploader: "BRKWZzFC9XMuJhCaf4kRdXFZugCKUvy4yrYhb2DD1TuE",
      },
    });

    await tx.stream.updateMany({
      where: {
        id: { in: streamIds },
      },
      data: {
        isCsvCreated: true,
      },
    });
  });

  console.log(`Reset CSV versioning to v1 with ${streamIds.length} stream(s).`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
