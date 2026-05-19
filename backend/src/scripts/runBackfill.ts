import dotenv from "dotenv";
import path from "path";

// Load env immediately
const envPath = path.resolve(__dirname, "../../.env");
dotenv.config({ path: envPath });

import { backfill } from "../services/backfill";

async function main() {
    console.log("Starting manual backfill...");
    await backfill();
}

main()
    .catch((err) => console.error("Backfill failed:", err))
    .finally(() => process.exit(0));
