import {
  appendTransactionMessageInstruction,
  setTransactionMessageLifetimeUsingBlockhash,
} from "@solana/kit";

export type KitInstruction = Parameters<typeof appendTransactionMessageInstruction>[0];
export type KitTransactionMessage = Parameters<typeof appendTransactionMessageInstruction>[1];
export type KitBlockhashLifetime = Parameters<typeof setTransactionMessageLifetimeUsingBlockhash>[0];
