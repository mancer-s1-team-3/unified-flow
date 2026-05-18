import prisma from "../db/prisma";

async function main() {
    console.log("Executing SQL swap for historical vesting types in PostgreSQL...");
    
    // Swap 1 -> 2 and 2 -> 1 inside Stream table using a CASE statement
    const updatedCount = await prisma.$executeRawUnsafe(
        `UPDATE "Stream" SET "vestingType" = CASE WHEN "vestingType" = 1 THEN 2 WHEN "vestingType" = 2 THEN 1 ELSE "vestingType" END WHERE "vestingType" IN (1, 2)`
    );
    
    console.log(`✔ Successfully swapped vestingType for ${updatedCount} rows in the Stream table!`);
}

main()
    .catch(err => {
        console.error("✘ Failed to execute DB update:", err);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
