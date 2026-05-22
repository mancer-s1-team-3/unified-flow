import prisma from "../db/prisma";

async function main() {
  const version = process.argv[2];
  const uploader = process.argv[3];

  if (!version) {
    throw new Error("Pass a CSV version number.");
  }

  if (!uploader) {
    throw new Error("Pass the uploader wallet address.");
  }

  const result = await prisma.csvUpload.deleteMany({
    where: {
      version: Number(version),
      uploader,
    },
  });

  console.log(`Deleted ${result.count} CSV version row(s) for uploader ${uploader} at version ${version}.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
