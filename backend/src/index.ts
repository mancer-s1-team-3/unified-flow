import { startIndexer }
  from "./services/streamIndexer";

import { backfill }
  from "./services/backfill";

import "./api/server";

async function main() {
  // historical sync
  await backfill();

  // realtime indexing
  await startIndexer();
}

main();