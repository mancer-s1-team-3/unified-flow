"use client";

import {
  WalletMultiButton,
} from "@solana/wallet-adapter-react-ui";

import Link from "next/link";

export default function Home() {
  return (
    <main className="p-10">
      <div className="flex justify-between">
        <h1 className="text-4xl font-bold">
          Unified Flow
        </h1>

        <WalletMultiButton />
      </div>

      <div className="mt-10 flex gap-4">
        <Link href="/streams">
          View Streams
        </Link>

        <Link href="/create">
          Create Stream
        </Link>
      </div>
    </main>
  );
}