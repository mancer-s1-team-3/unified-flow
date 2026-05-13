"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import { api } from "@/lib/api";

function formatDate(ts: string) {
  return new Date(
    Number(ts) * 1000
  ).toLocaleString();
}

function shorten(address: string) {
  return (
    address.slice(0, 4) +
    "..." +
    address.slice(-4)
  );
}

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
    <main className="min-h-screen p-10 bg-black text-white">
      <div className="flex items-center justify-between">
        <h1 className="text-4xl font-bold">
          Streams
        </h1>

        <div className="text-zinc-400">
          Total Streams:
          {" "}
          {streams.length}
        </div>
      </div>

      <div className="mt-10 grid gap-6">
        {streams.map((stream) => {
          const now =
            Math.floor(
              Date.now() / 1000
            );

          const start =
            Number(stream.startTs);

          const end =
            Number(stream.endTs);

          const total =
            Number(stream.totalAmount);

          const withdrawn =
            Number(stream.withdrawn);

          const duration =
            end - start;

          const elapsed =
            Math.min(
              Math.max(
                now - start,
                0
              ),
              duration
            );

          const vested =
            Math.floor(
              (total * elapsed) /
                duration
            );

          const claimable =
            Math.max(
              vested - withdrawn,
              0
            );

          const remaining =
            total - withdrawn;

          const progress =
            (elapsed / duration) *
            100;

          const isCompleted =
            withdrawn >= total;

          const isNotStarted =
            now < start;

          const isEnded =
            now >= end;

          return (
            <div
              key={stream.id}
              className="
                rounded-2xl
                border
                border-zinc-800
                bg-zinc-950
                p-6
              "
            >
              {/* HEADER */}

              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm text-zinc-500">
                    Stream
                  </div>

                  <div className="font-mono text-lg">
                    {shorten(
                      stream.id
                    )}
                  </div>
                </div>

                <div
                  className={`
                    px-3 py-1 rounded-full text-sm
                    ${
                      isCompleted
                        ? "bg-green-500/20 text-green-400"
                        : isEnded
                        ? "bg-yellow-500/20 text-yellow-400"
                        : "bg-blue-500/20 text-blue-400"
                    }
                  `}
                >
                  {isCompleted
                    ? "Completed"
                    : isEnded
                    ? "Ended"
                    : isNotStarted
                    ? "Scheduled"
                    : "Streaming"}
                </div>
              </div>

              {/* PROGRESS */}

              <div className="mt-6">
                <div className="flex justify-between text-sm mb-2">
                  <span>
                    Progress
                  </span>

                  <span>
                    {progress.toFixed(
                      2
                    )}
                    %
                  </span>
                </div>

                <div className="h-3 rounded-full bg-zinc-800 overflow-hidden">
                  <div
                    className="h-full bg-white"
                    style={{
                      width: `${progress}%`,
                    }}
                  />
                </div>
              </div>

              {/* GRID */}

              <div className="mt-6 grid grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="text-zinc-500">
                    Creator
                  </div>

                  <div className="font-mono">
                    {shorten(
                      stream.creator
                    )}
                  </div>
                </div>

                <div>
                  <div className="text-zinc-500">
                    Recipient
                  </div>

                  <div className="font-mono">
                    {shorten(
                      stream.recipient
                    )}
                  </div>
                </div>

                <div>
                  <div className="text-zinc-500">
                    Mint
                  </div>

                  <div className="font-mono">
                    {shorten(
                      stream.mint
                    )}
                  </div>
                </div>

                <div>
                  <div className="text-zinc-500">
                    Vault
                  </div>

                  <div className="font-mono">
                    {shorten(
                      stream.vault
                    )}
                  </div>
                </div>

                <div>
                  <div className="text-zinc-500">
                    Total Amount
                  </div>

                  <div>
                    {total.toLocaleString()}
                  </div>
                </div>

                <div>
                  <div className="text-zinc-500">
                    Withdrawn
                  </div>

                  <div>
                    {withdrawn.toLocaleString()}
                  </div>
                </div>

                <div>
                  <div className="text-zinc-500">
                    Claimable
                  </div>

                  <div>
                    {claimable.toLocaleString()}
                  </div>
                </div>

                <div>
                  <div className="text-zinc-500">
                    Remaining
                  </div>

                  <div>
                    {remaining.toLocaleString()}
                  </div>
                </div>

                <div>
                  <div className="text-zinc-500">
                    Start
                  </div>

                  <div>
                    {formatDate(
                      stream.startTs
                    )}
                  </div>
                </div>

                <div>
                  <div className="text-zinc-500">
                    End
                  </div>

                  <div>
                    {formatDate(
                      stream.endTs
                    )}
                  </div>
                </div>

                <div>
                  <div className="text-zinc-500">
                    Nonce
                  </div>

                  <div>
                    {stream.nonce}
                  </div>
                </div>

                <div>
                  <div className="text-zinc-500">
                    Cancelable
                  </div>

                  <div>
                    {stream.cancelable
                      ? "Yes"
                      : "No"}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </main>
  );
}