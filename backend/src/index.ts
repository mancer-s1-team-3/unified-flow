import { startIndexer }
  from "./services/streamIndexer";

import { backfill }
  from "./services/backfill";

import { logger, captureException }
  from "./services/logger";

import "./api/server";

// Last-resort safety nets so an unhandled async error is logged/tracked instead
// of silently killing the process with no trace.
process.on("unhandledRejection", (reason) => {
  captureException(reason, { kind: "unhandledRejection" });
});
process.on("uncaughtException", (err) => {
  captureException(err, { kind: "uncaughtException" });
});

async function main() {
  // Historical sync. A backfill failure must not prevent realtime indexing from
  // starting — log it and continue.
  try {
    await backfill();
  } catch (err) {
    captureException(err, { where: "backfill" });
    logger.warn("backfill failed — continuing to realtime indexing");
  }

  // Realtime indexing (self-healing: reconnects + heartbeat watchdog inside).
  await startIndexer();
}

main().catch((err) => {
  captureException(err, { where: "main" });
  process.exit(1);
});
