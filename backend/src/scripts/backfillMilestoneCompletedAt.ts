import dotenv from "dotenv";
import path from "path";
import * as anchor from "@coral-xyz/anchor";
import { Keypair, PublicKey } from "@solana/web3.js";

// Load env immediately so Prisma and RPC can read DATABASE_URL / RPC settings.
const envPath = path.resolve(__dirname, "../../.env");
dotenv.config({ path: envPath });

import prisma from "../db/prisma";
import { connection } from "../services/rpc";
import idl from "../idl/solana_program.json";

const PROGRAM_ID = new PublicKey(
  process.env.PROGRAM_ID || "8M5yieUh7pxwUi1YBByDF82nqoorZwaKi8dBoMVpurFa"
);

type TransactionRow = {
  slot: bigint;
  raw: unknown;
};

function getAnchorProgram() {
  const wallet = new anchor.Wallet(Keypair.generate());
  const provider = new anchor.AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });

  return new anchor.Program(idl as anchor.Idl, provider);
}

function parseBlockTimeFromRaw(raw: unknown): number | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const candidate = (raw as Record<string, unknown>).blockTime;
  if (typeof candidate === "number" && Number.isFinite(candidate)) {
    return candidate;
  }

  if (typeof candidate === "string") {
    const parsed = Number(candidate);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

async function resolveCompletionTs(tx: TransactionRow): Promise<bigint | null> {
  const rawBlockTime = parseBlockTimeFromRaw(tx.raw);
  if (rawBlockTime !== null) {
    return BigInt(rawBlockTime);
  }

  const slot = Number(tx.slot);
  if (!Number.isFinite(slot)) {
    return null;
  }

  const blockTime = await connection.getBlockTime(slot);
  return blockTime !== null ? BigInt(blockTime) : null;
}

async function resolveCompletionTsFromChain(streamId: string): Promise<bigint | null> {
  try {
    const program = getAnchorProgram();
    const programAccount: any = program.account;
    const streamPubkey = new PublicKey(streamId);

    const streamState: any = await programAccount.streamAccount.fetch(streamPubkey);
    if (!streamState || Number(streamState.vestingType) !== 2) {
      return null;
    }

    const milestoneCount = Number(streamState.milestoneCount || 0);
    if (!Number.isFinite(milestoneCount) || milestoneCount <= 0) {
      return null;
    }

    const lastUnlockedIndex = Number(streamState.nextMilestoneIndex || 0) - 1;
    if (lastUnlockedIndex < 0) {
      return null;
    }

    for (let index = Math.min(lastUnlockedIndex, milestoneCount - 1); index >= 0; index -= 1) {
      const [milestonePda] = PublicKey.findProgramAddressSync(
        [Buffer.from("milestone"), streamPubkey.toBuffer(), Buffer.from([index])],
        PROGRAM_ID
      );

      try {
        const milestoneState: any = await programAccount.milestoneAccount.fetch(milestonePda);
        const unlockTs = Number(milestoneState.unlockTs?.toString?.() ?? milestoneState.unlockTs ?? 0);

        if (unlockTs > 0) {
          return BigInt(unlockTs);
        }
      } catch {
        // Keep scanning backwards until we find the last unlocked milestone with a timestamp.
      }
    }

    return null;
  } catch {
    return null;
  }
}

async function main() {
  const apply = process.argv.includes("--apply");
  const streamArgIndex = process.argv.findIndex((arg) => arg === "--stream" || arg === "--stream-id");
  const targetStreamId = streamArgIndex >= 0 ? process.argv[streamArgIndex + 1] : undefined;

  const streams = await prisma.stream.findMany({
    where: {
      vestingType: 2,
      completedAt: null,
      ...(targetStreamId ? { id: targetStreamId } : {}),
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  console.log(`Found ${streams.length} milestone stream(s) missing completedAt.`);
  if (targetStreamId) {
    console.log(`Target stream filter: ${targetStreamId}`);
  }
  console.log(apply ? "Running in APPLY mode." : "Running in DRY-RUN mode. Pass --apply to write changes.");

  let updatedCount = 0;
  let skippedCount = 0;

  for (const stream of streams) {
    const milestoneTxs = await prisma.transaction.findMany({
      where: {
        streamId: stream.id,
        type: "MILESTONE_UNLOCKED",
      },
      orderBy: {
        slot: "desc",
      },
      take: 1,
      select: {
        slot: true,
        raw: true,
      },
    });

    if (milestoneTxs.length === 0) {
      console.log(`[skip] ${stream.id} has no indexed milestone unlock transaction.`);
      skippedCount += 1;
      continue;
    }

    const completionTs = await resolveCompletionTs(milestoneTxs[0]);
    const onChainCompletionTs = completionTs ?? await resolveCompletionTsFromChain(stream.id);
    const finalCompletionTs = onChainCompletionTs;
    if (finalCompletionTs === null) {
      console.log(`[skip] ${stream.id} could not resolve completion timestamp.`);
      skippedCount += 1;
      continue;
    }

    console.log(
      `[${apply ? "update" : "dry-run"}] ${stream.id} -> completedAt=${finalCompletionTs.toString()}${milestoneTxs.length > 0 ? ` (slot ${milestoneTxs[0].slot.toString()})` : " (on-chain milestone state)"}`
    );

    if (apply) {
      await prisma.stream.update({
        where: { id: stream.id },
        data: {
          completedAt: finalCompletionTs,
          status: 2,
        },
      });
      updatedCount += 1;
    }
  }

  console.log(
    apply
      ? `Backfill complete: ${updatedCount} updated, ${skippedCount} skipped.`
      : `Dry-run complete: ${updatedCount} would update, ${skippedCount} skipped.`
  );
}

main()
  .catch((err) => {
    console.error("Backfill milestone completedAt failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
