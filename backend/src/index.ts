import { startIndexer } from "./services/streamIndexer";
import "./api/server";

async function main() {
  await startIndexer();
}

main();