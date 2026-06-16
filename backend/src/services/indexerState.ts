// Shared, in-process liveness state for the realtime indexer. Written by
// streamIndexer (on each processed tx + heartbeat) and read by GET /health so an
// uptime monitor can tell whether indexing is alive, stalled, or paused.

export type IndexerState = {
  /** Whether the program-logs subscription is currently established. */
  subscribed: boolean;
  /** Slot of the most recently indexed transaction. */
  lastIndexedSlot: number | null;
  /** ISO timestamp of the most recently indexed transaction. */
  lastIndexedAt: string | null;
  /** ISO timestamp of the last successful RPC heartbeat (alive-but-idle signal). */
  lastHeartbeatAt: string | null;
  /** How many times the subscription has been re-established after an RPC outage. */
  reconnects: number;
  /** Last error message seen while subscribing / on heartbeat, if any. */
  lastError: string | null;
};

export const indexerState: IndexerState = {
  subscribed: false,
  lastIndexedSlot: null,
  lastIndexedAt: null,
  lastHeartbeatAt: null,
  reconnects: 0,
  lastError: null,
};
