"use client";

import {
  useEffect,
  useState,
} from "react";

import { api } from "@/lib/api";

export default function StreamsPage() {
  const [streams, setStreams] =
    useState<any[]>([]);

  useEffect(() => {
    async function load() {
      const res =
        await api.get("/streams");

      setStreams(res.data);
    }

    load();
  }, []);

  return (
    <main className="p-10">
      <h1 className="text-3xl font-bold">
        Streams
      </h1>

      <div className="mt-6 grid gap-4">
        {streams.map((stream) => (
          <div
            key={stream.id}
            className="border rounded-xl p-4"
          >
            <div>
              Stream:
              {stream.id}
            </div>

            <div>
              Creator:
              {stream.creator}
            </div>

            <div>
              Recipient:
              {stream.recipient}
            </div>

            <div>
              Amount:
              {stream.totalAmount}
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}