import dotenv from "dotenv";
import { PublicKey } from "@solana/web3.js";
import { Program, AnchorProvider, type Idl } from "@coral-xyz/anchor";
import { Keypair } from "@solana/web3.js";
import { connection } from "./rpc";
import prisma from "../db/prisma";
import { parseEventsSafely } from "./eventParser";
import {
  normalizeStreamCancelled,
  normalizeMilestoneUnlocked,
  normalizeStreamCreated,
  normalizeTokensClaimed,
  normalizeMilestoneEdited,
  normalizeLinearEdited,
  normalizeCliffEdited,
} from "./eventNormalizer";
import idl from "../idl/unified_flow.json";
import { logger, captureException } from "./logger";
import { indexerState } from "./indexerState";
import { recordTransaction, txRowId } from "./transactionRecorder";

dotenv.config();

const PROGRAM_ID = new PublicKey(process.env.PROGRAM_ID!);
const PROGRAM_IDL = idl as Idl;

const MAX_BACKOFF_MS = 30_000;
const HEARTBEAT_MS = 30_000;

let logsSubId: number | null = null;
let backoffMs = 1_000;
let rpcDown = false;

async function processLog(logInfo: { signature: string }) {
  try {
    logger.debug("indexer tx", { signature: logInfo.signature });

    // =========================
    // GET TX
    // =========================
    const tx = await connection.getTransaction(logInfo.signature, {
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0,
    });

    if (!tx) return;

    const logs = tx.meta?.logMessages || [];

    // =========================
    // PARSE EVENTS
    // =========================
    const events = parseEventsSafely(logs);

    // =========================
    // HANDLE EVENTS
    // =========================
    for (const event of events) {
      if (event.name === "StreamCreated") {
        await handleStreamCreated(event.data, tx, logInfo.signature);
      } else if (event.name === "TokensClaimed") {
        await handleTokensClaimed(event.data, tx, logInfo.signature);
      } else if (event.name === "MilestoneUnlocked") {
        await handleMilestoneUnlocked(event.data, tx, logInfo.signature);
      } else if (event.name === "StreamCancelled") {
        await handleStreamCancelled(event.data, tx, logInfo.signature);
      } else if (event.name === "MilestoneEdited") {
        await handleMilestoneEdited(event.data, tx, logInfo.signature);
      } else if (event.name === "LinearEdited") {
        await handleLinearEdited(event.data, tx, logInfo.signature);
      } else if (event.name === "CliffEdited") {
        await handleCliffEdited(event.data, tx, logInfo.signature);
      }
    }

    // Liveness signal consumed by GET /health.
    indexerState.lastIndexedSlot =
      typeof tx.slot === "number" ? tx.slot : Number(tx.slot);
    indexerState.lastIndexedAt = new Date().toISOString();
  } catch (err) {
    // No longer swallowed — funnels to structured logging / error tracking.
    captureException(err, {
      where: "indexer.processLog",
      signature: logInfo.signature,
    });
  }
}

function subscribe() {
  try {
    if (logsSubId !== null) {
      try {
        connection.removeOnLogsListener(logsSubId);
      } catch {
        /* listener already gone */
      }
      logsSubId = null;
    }
    logsSubId = connection.onLogs(PROGRAM_ID, processLog, "confirmed");
    indexerState.subscribed = true;
    indexerState.lastError = null;
    backoffMs = 1_000;
    logger.info("indexer subscribed to program logs", {
      programId: PROGRAM_ID.toBase58(),
      endpoint: (connection as unknown as { activeHttpEndpoint?: string })
        .activeHttpEndpoint,
    });
  } catch (err) {
    indexerState.subscribed = false;
    indexerState.lastError = err instanceof Error ? err.message : String(err);
    captureException(err, { where: "indexer.subscribe", retryInMs: backoffMs });
    setTimeout(subscribe, backoffMs);
    backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF_MS);
  }
}

// Periodic liveness check that doubles as WebSocket reconnect: web3.js `onLogs`
// does not auto-resubscribe after an endpoint drops, so when the RPC was down and
// recovers we re-establish the subscription. A failed heartbeat means RPC
// failover is exhausted — logged loudly so an external uptime monitor can alert.
async function heartbeat() {
  try {
    const slot = await connection.getSlot("confirmed");
    indexerState.lastHeartbeatAt = new Date().toISOString();
    if (rpcDown) {
      rpcDown = false;
      indexerState.reconnects += 1;
      logger.warn("RPC recovered — resubscribing indexer", { slot });
      subscribe();
    } else if (!indexerState.subscribed) {
      subscribe();
    }
  } catch (err) {
    rpcDown = true;
    indexerState.subscribed = false;
    indexerState.lastError = err instanceof Error ? err.message : String(err);
    logger.error(
      "indexer heartbeat failed — RPC failover exhausted, indexing paused",
      { err }
    );
  }
}

export async function startIndexer() {
  logger.info("Starting indexer...");
  subscribe();
  setInterval(heartbeat, HEARTBEAT_MS);
}

async function handleStreamCreated(event: any, tx: any, signature: string) {
  console.log("STREAM CREATED:", event);
  const normalized = normalizeStreamCreated(event);
  if (!normalized) {
    console.warn("Skipping StreamCreated event with missing fields:", event);
    return;
  }

  const streamId = normalized.stream;
  const milestoneCount = normalized.milestoneCount;

  // Fetch milestones FIRST before upsert to avoid empty milestones window
  let milestonesStr = "";
  if (milestoneCount > 0) {
    try {
      const provider = new AnchorProvider(
        connection as any,
        {
          publicKey: Keypair.generate().publicKey,
          signTransaction: async () => {
            throw new Error("Read-only");
          },
          signAllTransactions: async () => {
            throw new Error("Read-only");
          },
        },
        { commitment: "confirmed" }
      );
      const program = new Program(PROGRAM_IDL, provider);
      const amounts: string[] = [];

      for (let i = 0; i < milestoneCount; i++) {
        const [milestonePda] = PublicKey.findProgramAddressSync(
          [
            Buffer.from("milestone"),
            new PublicKey(streamId).toBuffer(),
            Buffer.from([i]),
          ],
          PROGRAM_ID
        );
        const account = await (program.account as any).milestoneAccount.fetch(
          milestonePda
        );
        amounts.push(account.amount.toString());
      }

      milestonesStr = amounts.join(";");
      console.log(
        `Fetched ${milestoneCount} milestones for stream ${streamId}`
      );
    } catch (error) {
      console.error(`Error fetching milestones for stream ${streamId}:`, error);
    }
  }

  await prisma.stream.upsert({
    where: { id: streamId },
    update: {
      // Only update milestones if we fetched them successfully
      // Never overwrite isCsvCreated — mark-origin may have already set it
      ...(milestonesStr ? { milestones: milestonesStr } : {}),
    },
    create: {
      id: streamId,
      creator: normalized.creator,
      recipient: normalized.recipient,
      mint: normalized.mint,
      vault: normalized.vault,
      totalAmount: normalized.totalAmount,
      withdrawn: BigInt(0),
      startTs: normalized.startTs,
      cliffTs: normalized.cliffTs,
      endTs: normalized.endTs,
      vestingType: normalized.vestingType,
      status: 1,
      cancelable: normalized.cancelable,
      milestoneCount: normalized.milestoneCount,
      milestones: milestonesStr,
      nonce: normalized.nonce,
      bump: 0,
      isCsvCreated: false, // default; mark-origin will update after frontend deploy
    },
  });

  await recordTransaction({
    signature,
    slot: tx.slot,
    streamId: streamId,
    type: "CREATE_STREAM",
    raw: tx,
  });

  console.log("Indexed stream:", streamId);
}

async function handleTokensClaimed(event: any, tx: any, signature: string) {
  console.log("TOKENS CLAIMED:", event);

  const normalized = normalizeTokensClaimed(event);
  if (!normalized) {
    console.warn("Skipping TokensClaimed event with missing fields:", event);
    return;
  }

  const streamId = normalized.stream;
  const withdrawnTotal = normalized.withdrawnTotal;

  // Fetch stream totalAmount to check if it's completed
  const stream = await prisma.stream.findUnique({
    where: { id: streamId },
  });

  if (stream) {
    let newStatus = 1; // ACTIVE
    if (withdrawnTotal >= stream.totalAmount) {
      newStatus = 2; // COMPLETED
    }

    await prisma.stream.update({
      where: { id: streamId },
      data: {
        withdrawn: withdrawnTotal,
        status: newStatus,
      },
    });
  } else {
    console.log(
      `Stream ${streamId} not found in database, skipping balance update.`
    );
  }

  await recordTransaction({
    signature,
    slot: tx.slot,
    streamId: stream ? streamId : null,
    type: "WITHDRAW",
    raw: tx,
  });

  console.log(
    `Indexed withdrawal for stream ${streamId}: ${normalized.claimable.toString()} tokens`
  );
}

async function handleMilestoneUnlocked(event: any, tx: any, signature: string) {
  console.log("MILESTONE UNLOCKED:", event);

  const normalized = normalizeMilestoneUnlocked(event);
  if (!normalized) {
    console.warn(
      "Skipping MilestoneUnlocked event with missing fields:",
      event
    );
    return;
  }

  const streamId = normalized.stream;
  const milestoneAmount = normalized.amount;
  const unlockTs = normalized.unlockTs;
  const completionTs =
    unlockTs ??
    (tx.blockTime !== null && tx.blockTime !== undefined
      ? BigInt(tx.blockTime)
      : null);
  const transactionId = txRowId(signature, streamId);
  const stream = await prisma.stream.findUnique({
    where: { id: streamId },
  });

  // The indexer can see the same signature more than once during reconnects
  // or backfill overlap. Guard the balance update so we never double-count a
  // milestone unlock if the transaction has already been recorded.
  const existingTx = await prisma.transaction.findUnique({
    where: { id: transactionId },
  });

  if (!existingTx) {
    if (stream) {
      const currentUnlocked = stream.unlockedAmount || BigInt(0);
      const updatedUnlocked = currentUnlocked + milestoneAmount;
      const completed = updatedUnlocked >= stream.totalAmount;
      await prisma.stream.update({
        where: { id: streamId },
        data: {
          unlockedAmount: updatedUnlocked,
          status: completed ? 2 : stream.status,
          completedAt:
            completed && completionTs !== null
              ? completionTs
              : stream.completedAt,
        },
      });
    } else {
      console.log(
        `Stream ${streamId} not found in database during milestone unlock, skipping.`
      );
    }
  }

  await recordTransaction({
    signature,
    slot: tx.slot,
    streamId: stream ? streamId : null,
    type: "MILESTONE_UNLOCKED",
    raw: tx,
  });

  console.log(
    `Indexed milestone unlock for stream ${streamId}: unlocked ${milestoneAmount.toString()} tokens`
  );
}

async function handleStreamCancelled(event: any, tx: any, signature: string) {
  console.log("STREAM CANCELLED:", event);

  const normalized = normalizeStreamCancelled(event);
  if (!normalized) {
    console.warn("Skipping StreamCancelled event with missing fields:", event);
    return;
  }

  const streamId = normalized.stream;

  const stream = await prisma.stream.findUnique({
    where: { id: streamId },
  });

  if (stream) {
    const nextWithdrawn = stream.withdrawn + normalized.claimableForRecipient;

    await prisma.stream.update({
      where: { id: streamId },
      data: {
        withdrawn: nextWithdrawn,
        status: 3,
      },
    });
  } else {
    console.log(
      `Stream ${streamId} not found in database, skipping cancel update.`
    );
  }

  await recordTransaction({
    signature,
    slot: tx.slot,
    streamId: stream ? streamId : null,
    type: "CANCEL",
    raw: tx,
  });

  console.log(
    `Indexed cancel for stream ${streamId}: vested ${normalized.vestedAmount.toString()} tokens`
  );
}

async function handleMilestoneEdited(event: any, tx: any, signature: string) {
  console.log("MILESTONE EDITED:", event);

  const normalized = normalizeMilestoneEdited(event);
  if (!normalized) {
    console.warn("Skipping MilestoneEdited event with missing fields:", event);
    return;
  }

  const streamId = normalized.stream;
  const stream = await prisma.stream.findUnique({ where: { id: streamId } });

  if (stream) {
    const diff = normalized.newAmount - normalized.oldAmount;
    const updatedTotal = stream.totalAmount + diff;

    let milestonesArr = stream.milestones ? stream.milestones.split(";") : [];
    while (milestonesArr.length <= normalized.index) {
      milestonesArr.push("0");
    }
    milestonesArr[normalized.index] = normalized.newAmount.toString();

    await prisma.stream.update({
      where: { id: streamId },
      data: {
        totalAmount: updatedTotal,
        milestones: milestonesArr.join(";"),
      },
    });
  }

  await recordTransaction({
    signature,
    slot: tx.slot,
    streamId: stream ? streamId : null,
    type: "MILESTONE_EDITED",
    raw: tx,
  });
}

async function handleLinearEdited(event: any, tx: any, signature: string) {
  console.log("LINEAR EDITED:", event);

  const normalized = normalizeLinearEdited(event);
  if (!normalized) {
    console.warn("Skipping LinearEdited event with missing fields:", event);
    return;
  }

  const streamId = normalized.stream;
  const stream = await prisma.stream.findUnique({ where: { id: streamId } });

  if (stream) {
    await prisma.stream.update({
      where: { id: streamId },
      data: {
        endTs: normalized.newEndTs,
        totalAmount: normalized.newTotalAmount,
      },
    });
  }

  await recordTransaction({
    signature,
    slot: tx.slot,
    streamId: stream ? streamId : null,
    type: "LINEAR_EDITED",
    raw: tx,
  });
}

async function handleCliffEdited(event: any, tx: any, signature: string) {
  console.log("CLIFF EDITED:", event);

  const normalized = normalizeCliffEdited(event);
  if (!normalized) {
    console.warn("Skipping CliffEdited event with missing fields:", event);
    return;
  }

  const streamId = normalized.stream;
  const stream = await prisma.stream.findUnique({ where: { id: streamId } });

  if (stream) {
    await prisma.stream.update({
      where: { id: streamId },
      data: {
        cliffTs: normalized.newCliffTs,
      },
    });
  }

  await recordTransaction({
    signature,
    slot: tx.slot,
    streamId: stream ? streamId : null,
    type: "CLIFF_EDITED",
    raw: tx,
  });
}
