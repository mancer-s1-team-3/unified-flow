"use client";

import {
  useWallet,
} from "@solana/wallet-adapter-react";

export default function CreatePage() {
  const wallet = useWallet();

  async function createStream() {
    console.log(
      "call anchor program here"
    );
  }

  return (
    <main className="p-10">
      <h1 className="text-3xl font-bold">
        Create Stream
      </h1>

      <button
        onClick={createStream}
        className="mt-6 border px-4 py-2"
      >
        Create
      </button>
    </main>
  );
}